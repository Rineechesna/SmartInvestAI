from fastapi import FastAPI, Request, Form, Query, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from transformers import pipeline
from dotenv import load_dotenv
import yfinance as yf
import os, re, json, csv, io, feedparser
import pandas as pd
import matplotlib.pyplot as plt
import base64
from io import BytesIO
from datetime import datetime, timedelta
from urllib.parse import quote_plus
from google.cloud import storage
import requests
from datetime import datetime
import random
from collections import Counter
from statistics import mean
from fpdf import FPDF
from typing import List
import matplotlib
from fastapi.responses import FileResponse
import tempfile
matplotlib.use('Agg')

# === Setup ===
load_dotenv()
gcs_bucket = "financial-advisor-chatbot-stock-data"
router = APIRouter()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
BASE_URL = "https://finnhub.io/api/v1/calendar"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sentiment_model = pipeline("sentiment-analysis", model="ProsusAI/finbert")
sp500 = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
sp500_lookup = {row['Security'].lower(): row['Symbol'] for _, row in sp500.iterrows()}
session_histories = {}  # username -> list of queries

# === GCS Helpers ===
def append_to_gcs_csv(filename, row):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(filename)
    rows = []
    if blob.exists():
        content = blob.download_as_text()
        reader = csv.reader(content.splitlines())
        rows = list(reader)
    rows.append(row)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    buffer.seek(0)
    blob.upload_from_string(buffer.read(), content_type='text/csv')

def write_to_gcs(filename, content):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(filename)
    if isinstance(content, str):
        blob.upload_from_string(content)
    else:
        blob.upload_from_string(json.dumps(content))

def get_gcs_blob_text(filename):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(filename)
    if not blob.exists():
        return None
    return blob.download_as_text()

# === Auth ===
@app.post("/register")
def register(username: str = Form(...), password: str = Form(...)):
    append_to_gcs_csv("users.csv", [username, password])
    return {"status": "Registered successfully"}

@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob("users.csv")
    if not blob.exists():
        return JSONResponse(status_code=401, content={"error": "User not found"})
    content = blob.download_as_text()
    reader = csv.reader(content.splitlines())
    for row in reader:
        if len(row) != 2:
            continue
        user, pwd = row
        if user == username and pwd == password:
            session_histories[username] = []
            return {"status": "Login successful"}
    return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

# === Core API ===
class QueryRequest(BaseModel):
    username: str
    query: str

class PortfolioInfo(BaseModel):
    username: str
    risk: str  # Expected values: "low", "medium", "high"
    horizon: str  # Expected values: "short-term", "medium-term", "long-term"
    sectors: List[str]  # e.g. ["technology", "healthcare"]

def recommend_stocks_based_on_portfolio(username):
    # Load user portfolio
    blob_text = get_gcs_blob_text(f"portfolios/{username}.json")
    if not blob_text:
        return "❌ Please complete your portfolio before requesting stock recommendations."

    portfolio = json.loads(blob_text)

    # Load enriched_predictions.csv from GCS
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob("enriched_predictions.csv")
    df = pd.read_csv(io.StringIO(blob.download_as_text()))
    df.columns = df.columns.str.strip()  # Strip BOMs and whitespace
    print("DEBUG COLUMNS:", df.columns.tolist())

    # Rename 'Ticker' to 'stock' for consistency
    df.rename(columns={"Ticker": "stock"}, inplace=True)

    # Add a simple score based on predicted close (this can be improved)
    df["score"] = df["Predicted_Close"]

    # Filter by portfolio sectors (case insensitive)
    filtered_df = df[df["GICS Sector"].str.lower().isin([s.lower() for s in portfolio["sectors"]])]

    if filtered_df.empty:
        return "❌ No matching stocks found for your selected sectors."

    # Sort and pick top 5 stocks
    top_stocks = filtered_df.sort_values(by="score", ascending=False).head(5)

    # Prepare reasoning prompt for LLM
    stock_names = top_stocks["stock"].tolist()
    reasoning_prompt = (
        f"User portfolio: {portfolio}. Stocks: {stock_names}. "
        f"Explain briefly why each stock is recommended and provide its current price."
    )

    llm_feedback = get_llm_response(reasoning_prompt)

    # Generate report and save to GCS
    result = top_stocks[["stock", "score"]].to_dict(orient="records")
    generate_pdf_report(username, result)
    write_to_gcs(f"recommendations/{username}.json", json.dumps(result))

    reply = (
        "**Your Portfolio**\n"
        f"{json.dumps(portfolio, indent=2)}\n\n"
        "**Top 5 Recommended Stocks:**\n" +
        "\n".join([f"- {r['stock']} (Score: {r['score']:.2f})" for r in result]) +
        f"\n\n🧠 LLM Insights:\n{llm_feedback}\n\n📄 Your report is saved in the Reports section."
    )
    return reply



@app.get("/portfolio")
def get_portfolio(username: str):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(f"portfolios/{username}.json")
    if not blob.exists():
        return JSONResponse(status_code=404, content={"error": "Portfolio not found"})
    return json.loads(blob.download_as_text())

def generate_pdf_report(username, recommended_stocks):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt=f"SmartInvest Stock Recommendation Report for {username}", ln=True, align='C')
    pdf.ln(10)
    for stock in recommended_stocks:
        pdf.cell(200, 10, txt=f"{stock['stock']}: Score {stock['score']:.2f}", ln=True)
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(f"reports/{username}_report.pdf")
    blob.upload_from_string(pdf.output(dest='S').encode("latin-1"), content_type="application/pdf")
    return f"reports/{username}_report.pdf"



@app.get("/reports/{username}")
def get_user_report(username: str):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(f"reports/{username}_report.pdf")

    if blob.exists():
        # ✅ Create a temporary file in a safe, cross-platform way
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            blob.download_to_filename(tmp_file.name)
            tmp_path = tmp_file.name

        return FileResponse(tmp_path, media_type="application/pdf", filename=f"{username}_report.pdf")
    
    return JSONResponse(status_code=404, content={"error": "Report not generated yet"})

@app.get("/recommendations/{username}")
def get_recommendations(username: str):
    client = storage.Client()
    bucket = client.bucket(gcs_bucket)
    blob = bucket.blob(f"recommendations/{username}.json")
    if not blob.exists():
        return JSONResponse(status_code=404, content={"error": "No recommendations yet"})
    return json.loads(blob.download_as_text())


@app.get("/company")
def company_overview(ticker: str):
    info = yf.Ticker(ticker).info
    return {
        "name": info.get("shortName", ticker),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "marketCap": f"${round(info.get('marketCap', 0) / 1e9, 2)}B" if info.get("marketCap") else "N/A",
        "peRatio": info.get("trailingPE", "N/A"),
        "description": info.get("longBusinessSummary", "N/A")
    }

@app.get("/earnings")
def earnings_chart(ticker: str = Query(...)):
    try:
        t = yf.Ticker(ticker)
        df = t.income_stmt

        if df is None or df.empty:
            return JSONResponse(status_code=404, content={"error": "Earnings data not available"})

        df = df.T  # Transpose for readability
        net_income = df["Net Income"] if "Net Income" in df.columns else df.iloc[:, 0]
        net_income = net_income[-5:]

        # Plot and convert to base64
        fig, ax = plt.subplots()
        net_income.plot(kind='bar', ax=ax)
        ax.set_title(f"{ticker} Net Income (Last 5 Periods)")
        ax.set_ylabel("USD")
        ax.set_xlabel("Date")
        plt.tight_layout()

        buffer = BytesIO()
        plt.savefig(buffer, format="png")
        plt.close(fig)
        buffer.seek(0)
        img_str = base64.b64encode(buffer.read()).decode("utf-8")

        return {"image": img_str}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# === Utility Functions ===
def detect_intent_with_gpt(query):
    return detect_intent_with_llama(query)

def resolve_targets_to_tickers(targets):
    tickers = []
    for target in targets:
        lower_target = target.lower()
        if lower_target in sp500_lookup:
            tickers.append(sp500_lookup[lower_target])
        elif target.upper() in sp500_lookup.values():
            tickers.append(target.upper())
        else:
            try:
                t = yf.Ticker(target)
                info = t.info
                if 'symbol' in info:
                    tickers.append(info['symbol'])
            except:
                continue
    return list(set(tickers))



def get_stock_price(ticker):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")

        if hist is None or hist.empty or "Close" not in hist.columns:
            return f"❌ No price data available for {ticker}."

        price = hist["Close"].iloc[-1]
        return f"📈 Latest closing price of {ticker}: ${price:.2f}"

    except Exception as e:
        return f"❌ Error fetching price for {ticker}: {str(e)}"



def extract_ticker(query):
    query_lower = query.lower()
    words = re.findall(r'\b\w+\b', query_lower)
    for symbol in sp500_lookup.values():
        if symbol.lower() in words:
            return symbol
    for name, symbol in sp500_lookup.items():
        if any(word in name for word in words):
            return symbol
    return None

def get_news_summary(query):
    ticker = extract_ticker(query)
    if not ticker:
        return "Could not identify target for news summary."
    company = next((name.title() for name, sym in sp500_lookup.items() if sym == ticker), ticker)
    search_query = quote_plus(f"{company} stock")
    url = f"https://news.google.com/rss/search?q={search_query}&hl=en-US&gl=US&ceid=US:en"
    feed = feedparser.parse(url)
    headlines = [entry.title for entry in feed.entries[:5]]
    prompt = f"Summarize these headlines about {company} stock:\n" + "\n".join(headlines)
    return get_llama_response(prompt)


def compare_two_stocks(tickers):
    t1, t2 = tickers
    data = {}
    for t in [t1, t2]:
        info = yf.Ticker(t)
        price = info.fast_info.get("lastPrice", "N/A")
        pe = info.info.get("trailingPE", "N/A")
        mc = info.info.get("marketCap", "N/A")
        data[t] = {
            "price": price,
            "pe_ratio": pe,
            "market_cap": f"${round(mc / 1e9, 2)}B" if mc else "N/A"
        }
    prompt = (
        f"Compare {t1} and {t2} stocks:\n\n"
        f"{t1}:\nPrice: {data[t1]['price']}, P/E: {data[t1]['pe_ratio']}, Market Cap: {data[t1]['market_cap']}\n\n"
        f"{t2}:\nPrice: {data[t2]['price']}, P/E: {data[t2]['pe_ratio']}, Market Cap: {data[t2]['market_cap']}\n\n"
        "Provide a short investment outlook comparison."
    )
    gpt_summary = get_llama_response(prompt)
    response = (
        f"📊 STOCK COMPARISON RESULT\n"
        f"\n{t1}:\n"
        f"  • Price: ${data[t1]['price']}\n"
        f"  • P/E Ratio: {data[t1]['pe_ratio']}\n"
        f"  • Market Cap: {data[t1]['market_cap']}\n"
        f"\n{t2}:\n"
        f"  • Price: ${data[t2]['price']}\n"
        f"  • P/E Ratio: {data[t2]['pe_ratio']}\n"
        f"  • Market Cap: {data[t2]['market_cap']}\n"
        f"\n🧠 INVESTMENT OUTLOOK SUMMARY:\n\n{gpt_summary.strip()}"
    )

    return response


def get_sentiment_finbert(text):
    result = sentiment_model(text)[0]
    return f"\U0001f9e0 Sentiment by FinBERT: **{result['label']}** (Confidence: {result['score']:.2f})"
def get_llm_response(query):
    return get_llama_response(query)


def get_llama_response(query):
    headers = {
        "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama3-70b-8192",  # Groq model name for LLaMA 3 70B
        "messages": [
            {"role": "system", "content": "You are a helpful financial assistant."},
            {"role": "user", "content": query}
        ]
    }
    response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    else:
        return f"❌ Error from Groq: {response.status_code} - {response.text}"


def detect_intent_with_llama(query):
    headers = {
        "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
        "Content-Type": "application/json"
    }
    system_prompt = (
        "You are a financial assistant that classifies user queries into one of the following types:\n"
        "- price: if the query asks about current stock prices\n"
        "- summary: if the query asks for recent stock/company news\n"
        "- sentiment: if the query asks for market or company sentiment\n"
        "- compare: if the query compares two companies\n"
        "- general: anything else\n"
        "\nReturn a JSON with two keys: 'intent' and 'targets' (list of stock names or symbols).\n"
        "Example: {\"intent\": \"price\", \"targets\": [\"Tesla\"]}"
    )
    payload = {
        "model": "llama3-70b-8192",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
    }
    response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
    try:
        result = response.json()
        raw = result["choices"][0]["message"]["content"].strip()
        parsed = json.loads(raw)
        return parsed.get("intent", "general"), parsed.get("targets", [])
    except Exception as e:
        return "general", []


# === Add these endpoints at the bottom of your backend ===

@app.get("/forecast")
def forecast_chart(ticker: str):
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="6mo")
        if hist.empty:
            return JSONResponse(status_code=404, content={"error": "No forecast data"})

        # Use simple moving average as dummy forecast
        hist["Forecast"] = hist["Close"].rolling(window=7).mean()

        fig, ax = plt.subplots()
        hist["Close"].plot(ax=ax, label="Close Price")
        hist["Forecast"].plot(ax=ax, label="7-day SMA Forecast")
        ax.set_title(f"{ticker} Forecast (Close vs 7-day SMA)")
        ax.set_ylabel("Stock Price (USD)")  # ✅ Add this line
        ax.set_xlabel("Date")               # ✅ Optional: Add X-axis label too
        ax.legend()
        plt.tight_layout()


        buffer = BytesIO()
        plt.savefig(buffer, format="png")
        plt.close(fig)
        buffer.seek(0)
        img_str = base64.b64encode(buffer.read()).decode("utf-8")

        return {"image": img_str}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/dashboard")
def dashboard_data(ticker: str):
    try:
        info = yf.Ticker(ticker).info
        return {
            "revenue": round(info.get("totalRevenue", 0) / 1e9, 2),
            "profit": round(info.get("grossProfits", 0) / 1e9, 2),
            "eps": info.get("trailingEps", "N/A")
        }
    except:
        return JSONResponse(status_code=500, content={"error": "Dashboard data error"})

@app.get("/health")
def stock_health(ticker: str):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="30d")

        if hist.empty:
            return JSONResponse(status_code=404, content={"error": "No historical data"})

        close = hist["Close"]
        change_1d = ((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2]) * 100
        change_7d = ((close.iloc[-1] - close.iloc[-7]) / close.iloc[-7]) * 100
        change_30d = ((close.iloc[-1] - close.iloc[0]) / close.iloc[0]) * 100
        volatility = close.pct_change().std() * 100  # daily stddev in %

        info = stock.info
        return {
            "pe_ratio": info.get("trailingPE", "N/A"),
            "analyst_rating": info.get("recommendationKey", "unknown").capitalize(),
            "change_1d": round(change_1d, 2),
            "change_7d": round(change_7d, 2),
            "change_30d": round(change_30d, 2),
            "volatility": round(volatility, 2)
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/alerts")
def smart_alerts():
    url = f"https://finnhub.io/api/v1/news?category=general&token={FINNHUB_API_KEY}"
    response = requests.get(url)

    if response.status_code != 200:
        return []

    news_items = response.json()[:5]

    alerts = []
    for item in news_items:
        alerts.append({
            "title": item["headline"],
            "timestamp": datetime.fromtimestamp(item["datetime"]).strftime("%Y-%m-%d %H:%M"),
            "link": item["url"]
        })

    return alerts




@app.get("/overview")
def get_stock_overview(ticker: str):
    try:
        stock = yf.Ticker(ticker.upper())
        info = stock.info

        return {
            "ticker": ticker.upper(),
            "revenue_growth": info.get("revenueGrowth", 0) * 100,
            "profit_growth": info.get("grossMargins", 0) * 100,
            "eps_growth": info.get("earningsQuarterlyGrowth", 0) * 100,
            "operating_margin": info.get("operatingMargins", 0) * 100,
            "roe": info.get("returnOnEquity", 0) * 100,
            "dividend_yield": info.get("dividendYield", 0) * 100,
            "analyst_recommendations": {
                "strong_buy": 4,  # Replace with actual if needed
                "buy": 22,
                "hold": 10,
                "sell": 3,
                "strong_sell": 1
            },
            "price_targets": {
                "low": info.get("targetLowPrice", 0),
                "average": info.get("targetMeanPrice", 0),
                "high": info.get("targetHighPrice", 0)
            }
        }
    except Exception as e:
        return {"error": str(e)} 


@app.get("/calendar")
def unified_calendar():
    from_date = datetime.today().strftime("%Y-%m-%d")
    to_date = (datetime.today() + timedelta(days=30)).strftime("%Y-%m-%d")

    earnings_url = f"{BASE_URL}/earnings?from={from_date}&to={to_date}&token={FINNHUB_API_KEY}"
    ipo_url = f"{BASE_URL}/ipo?from={from_date}&to={to_date}&token={FINNHUB_API_KEY}"
    economic_url = f"{BASE_URL}/economic?from={from_date}&to={to_date}&token={FINNHUB_API_KEY}"

    try:
        # Load and clean symbol set for fast lookup
        sp500_symbols = set(sp500_lookup.values())

        earnings_resp = requests.get(earnings_url).json().get("earningsCalendar", [])
        ipo_resp = requests.get(ipo_url).json().get("ipoCalendar", [])
        economic_resp = requests.get(economic_url).json().get("economicCalendar", [])

        print("Earnings Events Count:", len(earnings_resp))
        print("IPO Events Count:", len(ipo_resp))
        print("Economic Events Count:", len(economic_resp))

        events = []

        # Filter S&P 500 earnings
        for e in earnings_resp:
            symbol = e.get("symbol", "")
            if symbol in sp500_symbols:
                events.append({
                    "ticker": symbol,
                    "event": "Earnings Call",
                    "date": e.get("date", "N/A"),
                    "type": "earnings"
                })

        # Add all IPOs regardless of S&P 500 filter
        for ipo in ipo_resp:
            events.append({
                "ticker": ipo.get("symbol", ""),
                "event": f"IPO - {ipo.get('name', '')}",
                "date": ipo.get("date", "N/A"),
                "type": "ipo"
            })

        # Add all macroeconomic events (no filtering)
        for econ in economic_resp:
            events.append({
                "ticker": econ.get("country", "Macro"),
                "event": econ.get("event", "Economic Event"),
                "date": econ.get("date", "N/A"),
                "type": "economic",
                "country": econ.get("country", "US")
            })

        return sorted(events, key=lambda x: x["date"])
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    
@app.post("/smartchat")
def smart_chat(req: QueryRequest):
    query = req.query
    username = req.username

    # Detect intent and process accordingly
    intent, targets = detect_intent_with_gpt(query)

    if "recommend" in query.lower():
        reply = recommend_stocks_based_on_portfolio(username)
    elif intent == "price" and targets:
        reply = get_stock_price(targets[0])
    elif intent == "compare" and len(targets) == 2:
        reply = compare_two_stocks(targets)
    elif intent == "sentiment":
        reply = get_sentiment_finbert(query)
    elif intent == "summary":
        reply = get_news_summary(query)
    else:
        reply = get_llm_response(query)

    # Save history
    if username not in session_histories:
        session_histories[username] = []
    session_histories[username].append({"query": query, "reply": reply})

    return {"reply": reply}


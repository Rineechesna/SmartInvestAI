
import numpy as np
import pandas as pd
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
from google.cloud import storage, bigquery
import joblib
import os, io, glob

# === CONFIG ===
BUCKET_NAME = "financial-advisor-chatbot-stock-data"
PREDICTION_OUTPUT = "predicted_vs_actual_stock_prices.csv"
GCS_OUTPUT_BLOB = f"predictions/{PREDICTION_OUTPUT}"
PROJECT_ID = "smartinvest-ai"

# === Data Prep ===
def prepare_lstm_data(df, lookback=60):
    df = df[['date', 'Close']].dropna().sort_values('date')
    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(df[['Close']])

    X, y = [], []
    for i in range(lookback, len(scaled)):
        X.append(scaled[i-lookback:i])
        y.append(scaled[i])
    return np.array(X), np.array(y), scaler

# === Model ===
def train_lstm_model(X, y):
    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(X.shape[1], 1)),
        Dropout(0.2),
        LSTM(64),
        Dropout(0.2),
        Dense(1)
    ])
    model.compile(optimizer='adam', loss='mse')
    model.fit(X, y, epochs=15, batch_size=32, verbose=0)
    return model

# === Main Vertex-Compatible Prediction Logic ===
def main():
    # GCS setup
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)

    # Download all historical stock files
    os.makedirs("/tmp/stock_data", exist_ok=True)
    stock_files = []
    for blob in bucket.list_blobs():
        if blob.name.endswith("_Historical_Data.csv"):
            local_path = f"/tmp/stock_data/{os.path.basename(blob.name)}"
            blob.download_to_filename(local_path)
            stock_files.append(local_path)

    # Load sentiment from BigQuery
    bq_client = bigquery.Client(project=PROJECT_ID)
    query = """
    SELECT
      ticker,
      DATE(published_at) AS date,
      AVG(sentiment_score) AS avg_sentiment,
      COUNT(*) AS article_count
    FROM
      `smartinvest-ai.news_data.news_sentiment_scores`
    GROUP BY
      ticker, date
    ORDER BY
      date
    """
    news_df = bq_client.query(query).to_dataframe()
    news_df['date'] = pd.to_datetime(news_df['date'])

    # Predict
    results = []
    for file_path in stock_files:
        ticker = os.path.basename(file_path).split('_')[0]
        try:
            stock_df = pd.read_csv(file_path)
            stock_df['Date'] = pd.to_datetime(stock_df['Date'])
            stock_df.rename(columns={"Date": "date"}, inplace=True)

            df = pd.merge(stock_df, news_df[news_df['ticker'] == ticker], on='date', how='left')
            df = df.sort_values('date')

            if df.shape[0] < 65:
                continue

            X, y, scaler = prepare_lstm_data(df)
            X = X.reshape((X.shape[0], X.shape[1], 1))

            model = train_lstm_model(X, y)

            last_input = X[-1].reshape((1, 60, 1))
            predicted_scaled = model.predict(last_input)[0][0]
            predicted_close = scaler.inverse_transform([[predicted_scaled]])[0][0]

            results.append({"Ticker": ticker, "Predicted_Close": predicted_close})
        except Exception as e:
            print(f"⚠️ Error with {ticker}: {e}")

    results_df = pd.DataFrame(results)
    results_df.to_csv("/tmp/" + PREDICTION_OUTPUT, index=False)

    # Upload result to GCS
    blob = bucket.blob(GCS_OUTPUT_BLOB)
    blob.upload_from_filename("/tmp/" + PREDICTION_OUTPUT)
    print(f"✅ Uploaded predictions to GCS: {GCS_OUTPUT_BLOB}")

if __name__ == '__main__':
    main()

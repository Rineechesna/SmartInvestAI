import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import Select from "react-select";
import CountUp from "react-countup";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import StockOverviewPanel from "./StockOverviewPanel";
import {
  FaIndustry,
  FaBuilding,
  FaMoneyBillWave,
  FaChartLine,
  FaChevronDown,
  FaChevronUp
} from "react-icons/fa";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from "recharts";


import {
  TrendingUp,
  BarChart as BarChartIcon,
  Globe,
  Sparkles,
  LayoutDashboard,
  MessageCircle,
  LogIn,
  LogOut,
  UserPlus,
  UserCircle,
  Home,
} from "lucide-react";
import sp500List from "../public/sp500_dropdown.json"; // ✅ Safer name
import AlertsPanel from "./AlertsPanel";
import CalendarPanel from "./CalendarPanel";

interface CompanyOverview {
  name: string;
  sector: string;
  industry: string;
  marketCap: string;
  peRatio: number;
  description: string;
  logo?: string;
  chart?: string;
}
interface NewsItem {
  title: string;
  link: string;
  published: string;
  sentiment: string;
}
interface StockItem {
  symbol: string;
  name: string;
  sector: string;
  pe_ratio: number;
  sentiment: string;
}

interface Portfolio {
  risk: string;
  horizon: string;
  sectors: string[]; // ✅ fix type here
}
interface SectorOption {
  value: string;
  label: string;
}







interface Recommendation {
  ticker: string;
  score: number;
  price?: number;
}
const generalSections = [
  { icon: Home, label: "Home" },
  { icon: TrendingUp, label: "Company Overview" },
  { icon: Globe, label: "News Summary" },
  { icon: Sparkles, label: "Smart Query" },
  { icon: BarChartIcon, label: "Forecasting" },
  { icon: LayoutDashboard, label: "Stock Overview" },
  { icon: TrendingUp, label: "Stock Health" },
  { icon: MessageCircle, label: "Calendar" },
  { icon: MessageCircle, label: "Alerts" },
];
const userSections = [
  { icon: LayoutDashboard, label: "User History" },
  { icon: MessageCircle, label: "Portfolio" },
  { icon: MessageCircle, label: "Reports" },
];



export default function SmartInvestPro() {
  const [active, setActive] = useState("Home");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [tickers, setTickers] = useState<string[]>(["AAPL"]);
  const [companyData, setCompanyData] = useState<CompanyOverview | null>(null);
  const [earningsData, setEarningsData] = useState<{ [ticker: string]: string }>({});
  const [news, setNews] = useState<{ [ticker: string]: NewsItem[] }>({});
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newsQuery, setNewsQuery] = useState(""); // for user-entered ticker
  const [forecastData, setForecastData] = useState<{ [ticker: string]: string }>({});
  const [alerts, setAlerts] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [filters, setFilters] = useState({ pe: 0, sector: "", sentiment: 0 });
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [stockHealth, setStockHealth] = useState<any>(null);
  // const [dashboardData, setDashboardData] = useState<any>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [portfolio, setPortfolio] = useState({ risk: "", horizon: "", sectors: [] });

  


  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);
  

  const toggleTheme = () => {
    const newTheme = !darkMode;
    setDarkMode(newTheme);
    localStorage.setItem("theme", newTheme ? "dark" : "light");
    document.documentElement.classList.toggle("dark", newTheme);
  };

  const fetchCompanyOverview = async (ticker: string) => {
    const res = await fetch(`http://localhost:8000/company?ticker=${ticker}`);
    const data = await res.json();
    setCompanyData(data);
  };


const fetchStockHealth = async () => {
  const res = await fetch(`http://localhost:8000/health?ticker=${tickers[0]}`);
  const data = await res.json();
  setStockHealth(data);
};



  const fetchNews = async () => {
    if (!newsQuery) return;
    const res = await fetch(`http://localhost:8000/news?ticker=${newsQuery.toUpperCase()}`);
    const data = await res.json();
    setNews({ [newsQuery.toUpperCase()]: data.headlines });
  };

  const fetchForecastChart = async () => {
    const result: { [ticker: string]: string } = {};
    for (const ticker of tickers) {
      const res = await fetch(`http://localhost:8000/forecast?ticker=${ticker}`);
      const data = await res.json();
      result[ticker] = data.image;
    }
    setForecastData(result);
  };
  
  // const fetchDashboard = async () => {
  //   const res = await fetch(`http://localhost:8000/dashboard?ticker=${tickers[0]}`);
  //   const data = await res.json();
  //   setDashboardData(data);
  // };
  
  
  
  
  const fetchCalendar = async () => {
    const ticker = tickers[0]; // or any selected one
    const res = await fetch(`http://localhost:8000/calendar?ticker=${ticker}`);
    const data = await res.json();
    setCalendar(data);
  };
  
  
  const fetchSmartAlerts = async () => {
    const res = await fetch("http://localhost:8000/alerts");
    const data = await res.json();
    setAlerts(data);
  };

  
  
  const handleAsk = async (query: string) => {
    setQuery(query);
    setIsLoading(true);

    try {
        const res = await fetch("/smartchat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
        });

        if (res.ok) {
            const data = await res.json();
            const reply = typeof data.reply === "string" ? data.reply : "❌ Invalid reply format.";

            // Add to history ensuring it's always an array and has unique id
            setHistory((prev) => {
                const updatedHistory = Array.isArray(prev) ? prev : []; // Ensure prev is an array
                return [...updatedHistory, { id: Date.now(), userQuery: query, botReply: reply }];
            });

            setResponse(reply);
            setQuery("");
        } else {
            setHistory((prev) => [
                ...(Array.isArray(prev) ? prev : []),
                { id: Date.now(), userQuery: query, botReply: "❌ Failed to fetch response." },
            ]);
        }
    } catch (error) {
        console.error("Error during chat:", error);
        setHistory((prev) => [
            ...(Array.isArray(prev) ? prev : []),
            { id: Date.now(), userQuery: query, botReply: "❌ Error occurred." },
        ]);
    } finally {
        setIsLoading(false);
    }
};


  
  
  
  
  
  
  
  const savePortfolio = async () => {
    await fetch("http://localhost:8000/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, ...portfolio }),
    });
    alert("Portfolio saved!");
  };


  const handleLogin = async () => {
    const res = await fetch("http://localhost:8000/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
    });
    if (res.ok) {
      setLoggedIn(true);
      // Fetch portfolio
      await fetchPortfolio();  // Fetch the portfolio after login
      
      // Fetch recommendations
      const rec = await fetch(`http://localhost:8000/recommendations/${username}`);
      if (rec.ok) {
        const data = await rec.json();
        // Ensure data includes 'score' and set recommendations
        setRecommendations(data.map((item: any) => ({
          ticker: item.ticker,
          score: item.score ?? 0,  // Set default score if missing
          price: item.price ?? 0,  // Default price if missing
        })));
      }
  
      // Fetch chat history
      const hist = await fetch(`http://localhost:8000/history/${username}`);
      const data = await hist.json();
      setHistory(data);
      setShowLogin(false);
    } else {
      alert("Login failed.");
    }
  };
  
  

  const handleRegister = async () => {
    const res = await fetch("http://localhost:8000/register", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
    });
    if (res.ok) {
      alert("Registered successfully. Please login.");
      setShowRegister(false);
    }
  };
  const fetchPortfolio = async () => {
    const res = await fetch(`http://localhost:8000/portfolio?username=${username}`);
    if (res.ok) {
      const data = await res.json();
      setPortfolio(data);
    }
  };
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black text-white">
        <h1 className="text-5xl font-bold text-cyan-400 mb-4">SmartInvest AI</h1>
        <p className="text-gray-400 mb-6">Sign in to explore stock insights, trends, earnings, and more.</p>
        <div className="flex gap-4">
          <button onClick={() => setShowLogin(true)} className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-2 rounded">Login</button>
          <button onClick={() => setShowRegister(true)} className="bg-green-500 hover:bg-green-400 text-white px-6 py-2 rounded">Register</button>
        </div>

        {showLogin && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-xl w-full max-w-sm text-black dark:text-white">
              <h2 className="text-xl font-bold mb-4">Login</h2>
              <input className="w-full p-2 mb-3 border rounded bg-gray-100 dark:bg-gray-700" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input type="password" className="w-full p-2 mb-3 border rounded bg-gray-100 dark:bg-gray-700" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={handleLogin} className="bg-cyan-500 w-full py-2 text-white rounded mb-2">Login</button>
              <button onClick={() => setShowLogin(false)} className="w-full text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        {showRegister && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-xl w-full max-w-sm text-black dark:text-white">
              <h2 className="text-xl font-bold mb-4">Register</h2>
              <input className="w-full p-2 mb-3 border rounded bg-gray-100 dark:bg-gray-700" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input type="password" className="w-full p-2 mb-3 border rounded bg-gray-100 dark:bg-gray-700" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={handleRegister} className="bg-green-500 w-full py-2 text-white rounded mb-2">Register</button>
              <button onClick={() => setShowRegister(false)} className="w-full text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-white dark:bg-gray-900 text-black dark:text-white">
      {/* SIDEBAR AND MAIN OMITTED IN THIS PREVIEW FOR BREVITY */}
<aside className="bg-gray-100 dark:bg-black border-r border-gray-300 dark:border-gray-700 p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-4 text-cyan-500">SmartInvest</h1>
          <nav className="space-y-3">
            {generalSections.map(({ icon: Icon, label }) => (
              <button key={label} onClick={() => setActive(label)} className="flex items-center gap-3 text-base hover:text-cyan-400">
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
            <div className="text-sm font-semibold text-white mt-6">User Zone</div>
            {userSections.map(({ icon: Icon, label }) => (
              <button key={label} onClick={() => setActive(label)} className="flex items-center gap-3 text-base text-white hover:text-cyan-400">
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="text-xs text-gray-400 mt-8 relative">
          {loggedIn && (
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="text-xs flex items-center gap-3 text-white">
              <UserCircle className="w-4 h-4" /> {username} ⌄
            </button>
          )}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 border rounded text-sm w-40 shadow">
              <button className="w-full px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700">Profile Settings</button>
              <button onClick={() => {
                setLoggedIn(false);
                setUsername(""); setPassword(""); setResponse(""); setHistory([]);
              }} className="w-full px-4 py-2 text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700">Logout</button>
            </div>
          )}
        </div>
      </aside>

      <main className="p-8 overflow-y-auto">
      {active === "Home" && loggedIn && (
  <>
    <div className="text-center mt-10">
      <h2 className="text-4xl font-bold text-cyan-400">Welcome to SmartInvest AI</h2>
      <p className="text-gray-500 dark:text-gray-300 mt-2 text-sm">
        Choose a prompt below or type your own financial question.
      </p>
    </div>
    {loading && (
  <div className="text-center text-sm text-gray-500 dark:text-gray-300 mt-6">
    ⏳ Generating response...
    </div>
)}
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[
        "What is the latest stock price of Amazon?",
        "Compare AAPL and MSFT based on performance.",
        "Summarize recent news for Tesla.",
        "What’s the analyst forecast for Amazon stock?",
        "How is the market sentiment for Google?",
        "Can you recommend me some stocks?",
      ].map((q, i) => (
        <button
          key={i}
          onClick={async () => {
          
            setActive("Smart Query");
            setQuery(""); // Clear input box
            setLoading(true); // Show spinner
          
            try {
              const res = await fetch("http://localhost:8000/smartchat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, query: q }),
              });
          
              if (res.ok) {
                const data = await res.json();
                // ✅ Ensure both query and response go into chat history
                setHistory((prev) => [
                  ...prev,
                  `You: ${q}`,
                  `Bot: ${data.reply}`,
                ]);
                setResponse(data.reply); // show in markdown area too
              } else {
                setHistory((prev) => [
                  ...prev,
                  `You: ${q}`,
                  `Bot: ❌ Failed to fetch response.`,
                ]);
              }
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              setHistory((prev) => [
                ...prev,
                `You: ${q}`,
                `Bot: ❌ Error: ${errMsg}`,
              ]);
            }
            
          
            setLoading(false); // Hide spinner
          }}
          
          className="text-left bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded p-4 text-sm text-gray-800 dark:text-white"
        >
          {q}
        </button>
      ))}
    </div>

    <div className="mt-8 flex gap-4">
  <input
    className="w-full bg-white dark:bg-gray-800 border border-gray-400 dark:border-gray-600 rounded-lg px-4 py-2"
    placeholder="Ask your own question..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
  />
  <button
    onClick={handleAsk}
    className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-2 rounded-lg"
  >
    Ask
  </button>
</div>

{/* Conditional rendering for Smart Query */}
{active === "Smart Query" && response && (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <div className="mt-6 bg-gray-100 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded-lg p-6">
      <ReactMarkdown>
        {typeof response === 'string' ? response : "❌ Invalid response format."}
      </ReactMarkdown>
    </div>
  </motion.div>
)}



  </>
)}


{active === "Stock Overview" && (
  <StockOverviewPanel />
)}


{active === "User History" && (
  <div className="space-y-4">
    <h2 className="text-xl font-bold text-cyan-500 mb-4">Your Query History</h2>
    {history.length === 0 ? (
      <p className="text-gray-400">No queries yet.</p>
    ) : (
      <div className="space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className={`flex ${entry.userQuery ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] px-4 py-2 rounded-lg shadow text-sm ${
              entry.userQuery
                ? "bg-cyan-500 text-white rounded-br-none"
                : "bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded-bl-none"
            }`}>
              {entry.userQuery ? entry.userQuery : <ReactMarkdown>{entry.botReply}</ReactMarkdown>}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}





  
{active === "Company Overview" && (
  <div className="max-w-6xl mx-auto px-6 py-10 text-white">
    {/* Header */}
    <div className="text-center mb-10">
      <h2 className="text-4xl font-bold text-cyan-400">Explore Company Profile</h2>
      <p className="text-gray-400 mt-1 text-sm">Dive into sector, valuation, and market metrics</p>
    </div>

    {/* Search Bar */}
    <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-10">
      <Select
        isMulti={false}
        className="text-black w-full sm:w-64"
        placeholder="Select a stock..."
        options={sp500List.map(opt => ({ value: opt.value, label: opt.label }))}
        value={sp500List.find(opt => opt.value === tickers[0])}
        onChange={(selected) => selected && setTickers([selected.value])}
      />
      <button
        onClick={() => fetchCompanyOverview(tickers[0])}
        className="bg-cyan-500 hover:bg-cyan-600 text-white px-5 py-2 rounded-md"
      >
        Fetch Overview
      </button>
    </div>

    {/* Company Card */}
    {companyData && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gray-900 p-8 rounded-xl shadow-lg"
      >
        {/* Title and Logo */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-6">
          <div>
            <h3 className="text-3xl font-bold">{companyData.name}</h3>
            <p className="text-gray-400 text-sm">{tickers[0]}</p>
          </div>
          {companyData.logo && (
            <img
              src={companyData.logo}
              alt={`${companyData.name} logo`}
              className="h-14 sm:h-16 object-contain"
            />
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="bg-gray-800 p-4 rounded-md text-center">
            <p className="text-gray-400 text-sm">Sector</p>
            <p className="font-semibold text-base">{companyData.sector}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-md text-center">
            <p className="text-gray-400 text-sm">Industry</p>
            <p className="font-semibold text-base">{companyData.industry}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-md text-center">
            <p className="text-gray-400 text-sm">Market Cap</p>
            <p className="font-semibold text-base">{companyData.marketCap}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-md text-center">
            <p className="text-gray-400 text-sm">P/E Ratio</p>
            <p className="font-semibold text-base">{companyData.peRatio}</p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-6">
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="text-cyan-400 hover:underline text-sm"
          >
            {showDescription ? "Hide Description" : "Show Description"}
          </button>
          {showDescription && (
            <p className="mt-3 text-gray-300 text-sm leading-relaxed">
              {companyData.description}
            </p>
          )}
        </div>
      </motion.div>
    )}
  </div>
)}


      
        {active === "Stock Health" && (
  <>
    <button onClick={fetchStockHealth} className="bg-cyan-500 text-white px-4 py-2 rounded mb-6">
      Load Health Data
    </button>
    {tickers.length > 0 && (
      <h3 className="text-lg font-semibold mb-4 text-cyan-400">
        Showing Stock Health for: {tickers[0]}
      </h3>
    )}
    {stockHealth && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* P/E Ratio */}
        <div className="bg-gradient-to-br from-cyan-600 to-cyan-800 text-white p-6 rounded-lg shadow-lg">
          <h4 className="font-bold text-sm mb-2">P/E Ratio</h4>
          <CountUp end={stockHealth.pe_ratio} duration={2} separator="," className="text-2xl font-bold" />
        </div>

        {/* Analyst Rating */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 text-white p-6 rounded-lg shadow-lg">
          <h4 className="font-bold text-sm mb-2">Analyst Rating</h4>
          <p className="text-2xl font-bold">{stockHealth.analyst_rating}</p>
        </div>

        {/* Change 1d */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
          <h4 className="font-bold text-sm mb-2">Change (1d)</h4>
          <CountUp end={stockHealth.change_1d} duration={1.5} decimals={2} suffix="%" className="text-2xl font-bold" />
        </div>

        {/* Change 7d */}
        <div className="bg-gradient-to-br from-orange-600 to-orange-800 text-white p-6 rounded-lg shadow-lg">
          <h4 className="font-bold text-sm mb-2">Change (7d)</h4>
          <CountUp end={stockHealth.change_7d} duration={1.5} decimals={2} suffix="%" className="text-2xl font-bold" />
        </div>

        {/* Change 30d */}
        <div className="bg-gradient-to-br from-pink-600 to-pink-800 text-white p-6 rounded-lg shadow-lg">
          <h4 className="font-bold text-sm mb-2">Change (30d)</h4>
          <CountUp end={stockHealth.change_30d} duration={1.5} decimals={2} suffix="%" className="text-2xl font-bold" />
        </div>

        {/* Volatility with circular bar */}
        <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg flex flex-col items-center">
          <h4 className="font-semibold mb-4 text-gray-800 dark:text-gray-100">Volatility</h4>
          <div className="w-24 h-24">
            <CircularProgressbar
              value={stockHealth.volatility}
              text={`${stockHealth.volatility}%`}
              styles={buildStyles({
                textColor: "#10b981",
                pathColor: "#10b981",
                trailColor: "#f3f4f6",
              })}
            />
          </div>
        </div>
      </div>
    )}
  </>
)}



        
{active === "News Summary" && (
  <motion.div
    className="flex flex-col items-center text-center mt-10 space-y-6 px-4"
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
  >
    {/* 🖼 Image with overlay */}
    <div className="relative w-full max-w-4xl rounded-lg overflow-hidden shadow-lg">
      <img
        src="/news.jpg" // replace with your actual image name
        alt="News Banner"
        className="w-full h-64 object-cover filter brightness-75"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-sm flex items-center justify-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">Stay Ahead with Market News</h1>
      </div>
    </div>

    {/* Headline */}

    {/* Input section */}
    <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
      <input
        type="text"
        placeholder="Enter stock ticker (e.g., AAPL)"
        className="px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-600 w-72"
        value={newsQuery}
        onChange={(e) => setNewsQuery(e.target.value)}
      />
      <button
        onClick={fetchNews}
        className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-2 rounded-lg"
      >
        Fetch News
      </button>
    </div>
    <p className="text-gray-400 max-w-md text-sm">
      Enter a stock ticker to get the latest headlines and real-time market reactions.
    </p>

    {/* Results */}
    <div className="w-full mt-10">
      {Object.entries(news).map(([ticker, items]) => (
        <div key={ticker} className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-left">{ticker} - News Highlights</h3>
          {items.length === 0 ? (
            <p className="text-red-500">No headlines found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item, i) => (
                <motion.div
                  key={`${ticker}-${i}`}
                  className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {item.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">{item.published}</p>
                  <p className="text-sm mt-2 text-gray-600 dark:text-gray-300">{item.sentiment}</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  </motion.div>
)}




       
{active === "Smart Query" && (
  <>
    <div className="mb-4">
      <label
        htmlFor="query-input"
        className="block text-sm font-medium text-gray-700 dark:text-white mb-1"
      >
        Ask a financial question:
      </label>
      <div className="flex gap-4">
        <input
          id="query-input"
          className="w-full bg-white dark:bg-gray-800 border border-gray-400 dark:border-gray-600 rounded-lg px-4 py-2"
          placeholder="e.g. Should I invest in Tesla?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={handleAsk}
          className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-2 rounded-lg"
        >
          Ask
        </button>
      </div>
    </div>

    {history.length > 0 && (
  <div className="space-y-4 mt-6">
    {history.map((item, index) => (
      <div key={index} className="flex flex-col">
        {item.startsWith("You:") ? (
          <div className="self-end bg-cyan-500 text-white px-4 py-2 rounded-lg max-w-[80%] ml-auto">
            {item.replace("You: ", "")}
          </div>
        ) : (
          <div className="self-start bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg max-w-[80%] mr-auto mt-2 text-sm space-y-2">
            {item.includes("**Your Portfolio**") ? (
              <>
                <h3 className="font-semibold text-cyan-600">Your Portfolio</h3>
                <pre className="bg-white text-black p-2 rounded overflow-x-auto">
                  {item.split("**Your Portfolio**")[1]
                       .split("**Top 5 Recommended Stocks:**")[0]
                       .replace("Bot: ", "")
                       .trim()}
                </pre>

                <h3 className="font-semibold text-cyan-600">Top 5 Recommended Stocks</h3>
                <ul className="list-disc list-inside">
                  {(item.match(/- \*\*(.*?)\*\*/g) || []).map((line, i) => (
                    <li key={i}>{line.replace(/\*\*/g, "")}</li>
                  ))}
                </ul>

                {item.includes("🧠 LLM Insights:") && (
                  <>
                    <h3 className="font-semibold text-cyan-600">LLM Insights</h3>
                    <p>{item.split("🧠 LLM Insights:")[1].split("📄")[0].trim()}</p>
                  </>
                )}
              </>
            ) : (
              <ReactMarkdown>{item.replace("Bot: ", "")}</ReactMarkdown>
            )}
          </div>
        )}
      </div>
    ))}
  </div>
)}


    {/* {response && (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-gray-50 dark:bg-gray-800 border p-6 rounded-lg text-base leading-relaxed text-gray-800 dark:text-gray-100 space-y-3">
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => (
                <h2 className="text-xl font-bold mb-2" {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />
              ),
              p: ({ node, ...props }) => <p className="mb-2" {...props} />,
              strong: ({ node, ...props }) => (
                <strong className="font-semibold" {...props} />
              ),
            }}
          >
            {response}
          </ReactMarkdown>
        </div>
      </motion.div>
    )} */}
  </>
)}

   {active === "Portfolio" && (
  <div className="max-w-4xl mx-auto space-y-10 py-6">
  <h2 className="text-3xl font-bold text-cyan-400">Your Investment Profile</h2>

  {/* FORM SECTION */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-700">
    <div>
      <label className="block mb-2 text-sm font-semibold text-cyan-200">Risk Tolerance</label>
      <select
        className="w-full p-3 rounded-md bg-gray-800 text-white border border-gray-600"
        value={portfolio.risk}
        onChange={(e) => setPortfolio(prev => ({ ...prev, risk: e.target.value }))}
      >
        <option value="">Select...</option>
        <option value="low">Low </option>
        <option value="medium">Medium </option>
        <option value="high">High </option>
      </select>
    </div>

    <div>
      <label className="block mb-2 text-sm font-semibold text-cyan-200">Investment Horizon</label>
      <select
        className="w-full p-3 rounded-md bg-gray-800 text-white border border-gray-600"
        value={portfolio.horizon}
        onChange={(e) => setPortfolio(prev => ({ ...prev, horizon: e.target.value }))}
      >
        <option value="">Select...</option>
        <option value="short-term">Short-Term</option>
        <option value="medium-term">Medium-Term</option>
        <option value="long-term">Long-Term</option>
      </select>
    </div>

    <div className="md:col-span-2">
      <label className="block mb-2 text-sm font-semibold text-cyan-200">Preferred Sectors</label>
      <Select
        isMulti
        options={[
          "Communication Services", "Consumer Discretionary", "Consumer Staples",
          "Energy", "Financials", "Health Care", "Industrials", "Information Technology",
          "Materials", "Real Estate", "Utilities"
        ].map(sector => ({ value: sector, label: sector }))}
        value={portfolio.sectors.map(s => ({ value: s, label: s }))}
        onChange={(selected) =>
          setPortfolio(prev => ({
            ...prev,
            sectors: selected.map(option => option.value)
          }))
        }
        className="text-black"
      />
    </div>

    <div className="md:col-span-2 text-right">
      <button
        onClick={savePortfolio}
        className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2 rounded shadow"
      >
        💾 Save Portfolio
      </button>
    </div>
  </div>

  {/* SAVED PORTFOLIO */}
  {portfolio.risk && portfolio.horizon && portfolio.sectors.length > 0 && (
    <div className="bg-gray-800 p-5 rounded-lg shadow-md border border-gray-700">
      <h3 className="text-xl font-bold text-cyan-300 mb-3">✅ Your Saved Portfolio</h3>
      <ul className="text-white space-y-1 text-sm">
        <li><span className="font-semibold text-cyan-400">Risk Tolerance:</span> {portfolio.risk}</li>
        <li><span className="font-semibold text-cyan-400">Investment Horizon:</span> {portfolio.horizon}</li>
        <li><span className="font-semibold text-cyan-400">Sectors:</span> {portfolio.sectors.join(", ")}</li>
      </ul>
    </div>
  )}

  {/* RECOMMENDATIONS */}
  {recommendations.length > 0 && (
  <div className="bg-gradient-to-tr from-gray-900 to-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
    <h3 className="text-xl font-bold text-cyan-400 mb-4">📊 Top Recommended Stocks</h3>
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {recommendations.map((stock, i) => (
        <li key={i} className="bg-gray-700 p-4 rounded-lg text-white shadow-sm border border-gray-600">
          <h4 className="font-semibold text-lg text-cyan-300">{stock.ticker}</h4>
          <p>💡 Score: {stock.score.toFixed(2)}</p>
          <p>💰 Price: ${stock.price?.toFixed(2) ?? "N/A"}</p>
        </li>
      ))}
    </ul>
  </div>
)}

</div>

)}
{active === "Reports" && (
  <div className="max-w-lg space-y-6">
    <h2 className="text-2xl font-bold text-cyan-500 mb-4">Download Your Recommendation Report</h2>

    <button
      onClick={async () => {
        const res = await fetch(`http://localhost:8000/reports/${username}`);
        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${username}_report.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          alert("No report generated yet.");
        }
      }}
      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
    >
      Download Report
    </button>
  </div>
)}

    
          {active === "Forecasting" && (
            <>
              <button onClick={fetchForecastChart} className="mb-4 bg-cyan-500 text-white px-4 py-2 rounded">Get Forecast</button>
              {Object.entries(forecastData).map(([ticker, img]) => (
  <div key={ticker} className="mb-6">
    <h3 className="text-lg font-semibold mb-2">{ticker} Forecast</h3>
    <img src={`data:image/png;base64,${img}`} alt={`${ticker} Forecast`} className="rounded shadow-lg w-full max-w-4xl" />
  </div>
))}

            </>
          )}
          
          
          {active === "Alerts" && <AlertsPanel />}
{active === "Calendar" && <CalendarPanel />}
    
 
          
          

 
          
        
        </main>
        </div>
   );
  }
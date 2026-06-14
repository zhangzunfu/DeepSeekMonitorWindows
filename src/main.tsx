import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import {
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  CreditCard,
  Info,
  KeyRound,
  Power,
  RefreshCw,
  Settings,
  Shirt,
  SunMedium,
  X,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import "./styles.css";

type ViewName = "dashboard" | "settings" | "detail";
type ModelName = "flash" | "pro" | "plan" | "compensation";
type ProviderName = "deepseek" | "mimo";

type AppConfig = {
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
  usageTokenConfigured: boolean;
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
  autostart: boolean;
  configPath: string;
  currentProvider: ProviderName;
  mimoCookieConfigured: boolean;
};

type BalanceData = {
  isAvailable: boolean;
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
};
type BalanceState = "loading" | "ok" | "error" | "nokey";

type UsageModel = {
  key: string;
  name: string;
  totalTokens: number;
  requestCount: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  responseTokens: number;
  cost: number;
};
type UsageDay = {
  date: string;
  flashTokens: number;
  flashCacheHit: number;
  flashCacheMiss: number;
  flashResponse: number;
  proTokens: number;
  proCacheHit: number;
  proCacheMiss: number;
  proResponse: number;
  totalTokens: number;
  totalCost: number;
};
type UsageResult = {
  models: UsageModel[];
  days: UsageDay[];
  monthCost: number;
};

type MimoBalanceData = {
  currency: string;
  totalBalance: string;
  cashBalance: string;
  giftBalance: string;
  frozenBalance: string;
};
type MimoPlanItem = {
  name: string;
  planName: string;
  used: number;
  total: number;
  remaining: number;
  unit: string;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtTokensShort = (n: number) => {
  if (n >= 1e8) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};
const fmtMoney = (n: number) => "¥" + n.toFixed(2);
const mmdd = (date: string) => {
  const parts = date.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date;
};
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, offset: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
};
const recentUsageDays = (days: UsageDay[], count = 7): UsageDay[] => {
  const source = new Map(days.filter((day) => day.date <= todayStr()).map((day) => [day.date, day]));
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = dateKey(addDays(today, index - count + 1));
    return (
      source.get(date) ?? {
        date,
        flashTokens: 0,
        flashCacheHit: 0,
        flashCacheMiss: 0,
        flashResponse: 0,
        proTokens: 0,
        proCacheHit: 0,
        proCacheMiss: 0,
        proResponse: 0,
        totalTokens: 0,
        totalCost: 0,
      }
    );
  });
};
const previousMonth = (date: Date) => {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return { month: previous.getMonth() + 1, year: previous.getFullYear() };
};
const fetchMonthUsage = (month: number, year: number) => {
  return invoke<UsageResult>("fetch_usage", { month, year });
};
const fetchCurrentUsage = async () => {
  const now = new Date();
  const current = await fetchMonthUsage(now.getMonth() + 1, now.getFullYear());
  const needsPreviousMonth = addDays(now, -6).getMonth() !== now.getMonth();
  if (!needsPreviousMonth) {
    return current;
  }
  try {
    const previous = previousMonth(now);
    const previousUsage = await fetchMonthUsage(previous.month, previous.year);
    return {
      ...current,
      days: [...previousUsage.days, ...current.days],
    };
  } catch {
    return current;
  }
};

const refreshOptions = [
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
  { label: "30 分钟", value: 1800 },
  { label: "1 小时", value: 3600 },
];

function App() {
  const [view, setView] = React.useState<ViewName>("dashboard");
  const [model, setModel] = React.useState<ModelName>("flash");

  // Provider state
  const [currentProvider, setCurrentProvider] = React.useState<ProviderName>("deepseek");

  // DeepSeek states
  const [balance, setBalance] = React.useState<BalanceData | null>(null);
  const [balanceState, setBalanceState] = React.useState<BalanceState>("loading");
  const [balanceError, setBalanceError] = React.useState("");

  const [usage, setUsage] = React.useState<UsageResult | null>(null);
  const [usageState, setUsageState] = React.useState<BalanceState>("loading");
  const [usageError, setUsageError] = React.useState("");

  // MIMO states
  const [mimoBalance, setMimoBalance] = React.useState<MimoBalanceData | null>(null);
  const [mimoBalanceState, setMimoBalanceState] = React.useState<BalanceState>("loading");
  const [mimoBalanceError, setMimoBalanceError] = React.useState("");

  const [mimoPlan, setMimoPlan] = React.useState<MimoPlanItem[] | null>(null);
  const [mimoPlanState, setMimoPlanState] = React.useState<BalanceState>("loading");
  const [mimoPlanError, setMimoPlanError] = React.useState("");

  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = React.useState(60);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(false);

  // DeepSeek loaders
  const loadBalance = React.useCallback(() => {
    setBalanceState("loading");
    void invoke<BalanceData>("fetch_balance")
      .then((data) => {
        setBalance(data);
        setBalanceState("ok");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setBalanceError(message);
        setBalanceState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  const loadUsage = React.useCallback(() => {
    setUsageState("loading");
    void fetchCurrentUsage()
      .then((data) => {
        setUsage(data);
        setUsageState("ok");
        setUsageError("");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setUsageError(message);
        setUsage(null);
        setUsageState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  // MIMO loaders
  const loadMimoBalance = React.useCallback(() => {
    setMimoBalanceState("loading");
    void invoke<MimoBalanceData>("fetch_mimo_balance")
      .then((data) => {
        setMimoBalance(data);
        setMimoBalanceState("ok");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setMimoBalanceError(message);
        setMimoBalanceState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  const loadMimoUsage = React.useCallback(() => {
    setMimoPlanState("loading");
    void invoke<UsageResult>("fetch_mimo_usage")
      .then((data) => {
        const planItems: MimoPlanItem[] = data.models.map((m) => ({
          name: m.key,
          planName: m.name,
          used: m.totalTokens,
          total: m.cacheHitTokens, // limit is carried in cacheHitTokens
          remaining: Math.max(0, m.cacheHitTokens - m.totalTokens),
          unit: "tokens",
        }));
        setMimoPlan(planItems);
        setMimoPlanState("ok");
        setMimoPlanError("");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setMimoPlanError(message);
        setMimoPlan(null);
        setMimoPlanState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  const refreshAll = React.useCallback(() => {
    if (currentProvider === "deepseek") {
      loadBalance();
      loadUsage();
    } else {
      loadMimoBalance();
      loadMimoUsage();
    }
  }, [currentProvider, loadBalance, loadUsage, loadMimoBalance, loadMimoUsage]);

  // Load provider from config on init
  React.useEffect(() => {
    void invoke<AppConfig>("get_app_config")
      .then((config) => {
        setRefreshIntervalSeconds(config.refreshIntervalSeconds || 60);
        setAutoRefreshEnabled(config.autoRefreshEnabled);
        if (config.currentProvider) {
          setCurrentProvider(config.currentProvider);
        }
      })
      .catch(() => {
        setRefreshIntervalSeconds(60);
        setAutoRefreshEnabled(false);
      });
  }, []);

  // Provider change handler - reset and reload
  const handleProviderChange = React.useCallback(
    (nextProvider: ProviderName) => {
      if (nextProvider === currentProvider) return;
      setCurrentProvider(nextProvider);
      // Reset all states
      setBalance(null);
      setBalanceState("loading");
      setBalanceError("");
      setUsage(null);
      setUsageState("loading");
      setUsageError("");
      setMimoBalance(null);
      setMimoBalanceState("loading");
      setMimoBalanceError("");
      setMimoPlan(null);
      setMimoPlanState("loading");
      setMimoPlanError("");
      // Save preference
      void invoke("save_current_provider", { currentProvider: nextProvider }).catch(() => {});
    },
    [currentProvider],
  );

  // Trigger data loading when provider changes
  React.useEffect(() => {
    if (currentProvider === "deepseek") {
      loadBalance();
      loadUsage();
    } else {
      loadMimoBalance();
      loadMimoUsage();
    }
  }, [currentProvider, loadBalance, loadUsage, loadMimoBalance, loadMimoUsage]);

  React.useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }
    const timer = window.setInterval(refreshAll, refreshIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshAll, refreshIntervalSeconds]);

  const hideWindow = React.useCallback(() => {
    void invoke("hide_main_window").catch(() => {
      // Browser preview has no Tauri IPC. Keep it non-blocking for visual checks.
    });
  }, []);

  return (
    <div className="stage">
      {view === "dashboard" && (
        <DashboardPanel
          currentProvider={currentProvider}
          balance={balance}
          balanceState={balanceState}
          balanceError={balanceError}
          usage={usage}
          usageState={usageState}
          usageError={usageError}
          mimoBalance={mimoBalance}
          mimoBalanceState={mimoBalanceState}
          mimoBalanceError={mimoBalanceError}
          mimoPlan={mimoPlan}
          mimoPlanState={mimoPlanState}
          mimoPlanError={mimoPlanError}
          onRefresh={refreshAll}
          onClose={hideWindow}
          onSettings={() => setView("settings")}
          onDetail={(nextModel) => {
            setModel(nextModel);
            setView("detail");
          }}
          onProviderChange={handleProviderChange}
        />
      )}
      {view === "settings" && (
        <SettingsPanel
          currentProvider={currentProvider}
          onProviderChange={handleProviderChange}
          onUsageLoaded={(nextUsage) => {
            setUsage(nextUsage);
            setUsageState("ok");
            setUsageError("");
          }}
          onUsageCleared={() => {
            setUsage(null);
            setUsageState("nokey");
            setUsageError("未配置用量 Token");
          }}
          onRefreshIntervalChanged={setRefreshIntervalSeconds}
          onAutoRefreshChanged={setAutoRefreshEnabled}
          onBack={() => setView("dashboard")}
        />
      )}
      {view === "detail" && (
        <ModelDetailPanel
          currentProvider={currentProvider}
          model={model}
          usage={usage}
          usageState={usageState}
          onBack={() => setView("dashboard")}
        />
      )}
    </div>
  );
}

function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-icon" style={{ width: size, height: size }}>
      <img src="/assets/deepseek-color.png" alt="DeepSeek" />
    </div>
  );
}

function MimoBrandIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-icon" style={{ width: size, height: size }}>
      <img src="/assets/mimo-color.png" alt="MiMo" />
    </div>
  );
}

function ProviderSwitch({
  currentProvider,
  onChange,
}: {
  currentProvider: ProviderName;
  onChange: (provider: ProviderName) => void;
}) {
  const isDeepSeek = currentProvider === "deepseek";
  const toggle = () => onChange(isDeepSeek ? "mimo" : "deepseek");

  return (
    <button
      className="provider-switch"
      onClick={toggle}
      title={isDeepSeek ? "切换到 MiMo" : "切换到 DeepSeek"}
      aria-label={isDeepSeek ? "切换到 MiMo" : "切换到 DeepSeek"}
    >
      <span className="provider-switch-icon">
        {isDeepSeek ? <BrandIcon size={18} /> : <MimoBrandIcon size={18} />}
      </span>
      <ArrowLeftRight size={14} />
    </button>
  );
}

function DashboardPanel({
  currentProvider,
  balance,
  balanceState,
  balanceError,
  usage,
  usageState,
  usageError,
  mimoBalance,
  mimoBalanceState,
  mimoBalanceError,
  mimoPlan,
  mimoPlanState,
  mimoPlanError,
  onRefresh,
  onClose,
  onSettings,
  onDetail,
  onProviderChange,
}: {
  currentProvider: ProviderName;
  balance: BalanceData | null;
  balanceState: BalanceState;
  balanceError: string;
  usage: UsageResult | null;
  usageState: BalanceState;
  usageError: string;
  mimoBalance: MimoBalanceData | null;
  mimoBalanceState: BalanceState;
  mimoBalanceError: string;
  mimoPlan: MimoPlanItem[] | null;
  mimoPlanState: BalanceState;
  mimoPlanError: string;
  onRefresh: () => void;
  onClose: () => void;
  onSettings: () => void;
  onDetail: (model: ModelName) => void;
  onProviderChange: (provider: ProviderName) => void;
}) {
  const [theme, setTheme] = React.useState<string>(
    () => localStorage.getItem("ui-theme") || "dark",
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ui-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };
  const flash = usage?.models.find((item) => item.key === "flash") ?? null;
  const pro = usage?.models.find((item) => item.key === "pro") ?? null;
  const maxTokens = Math.max(flash?.totalTokens ?? 0, pro?.totalTokens ?? 0, 1);
  const today = usage?.days.find((day) => day.date === todayStr()) ?? null;
  const todayCost = usageState === "ok" && today ? today.totalCost : null;
  const monthCost = usageState === "ok" && usage ? usage.monthCost : null;

  const isDeepSeek = currentProvider === "deepseek";
  const title = isDeepSeek ? "DeepSeek Monitor" : "MiMo Monitor";
  const providerIcon = isDeepSeek ? <BrandIcon size={36} /> : <MimoBrandIcon size={36} />;

  return (
    <section className="panel dashboard-panel" data-testid="dashboard-panel">
      <header className="panel-header" data-tauri-drag-region>
        <div className="title-lockup" data-tauri-drag-region>
          {providerIcon}
          <h1>{title}</h1>
        </div>
        <ProviderSwitch currentProvider={currentProvider} onChange={onProviderChange} />
        <div className="header-actions">
          <button aria-label="刷新" onClick={onRefresh}>
            <RefreshCw size={22} />
          </button>
          <div className="skin-menu-wrap">
            <button
              aria-label="Toggle theme"
              className="skin-toggle"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={toggleTheme}
            >
              <Shirt size={21} />
            </button>
          </div>
          <button aria-label="设置" onClick={onSettings}>
            <Settings size={23} />
          </button>
          <button aria-label="关闭" onClick={onClose}>
            <X size={25} />
          </button>
        </div>
      </header>

      {isDeepSeek ? (
        <>
          <BalanceCard
            currentProvider={currentProvider}
            balance={balance}
            state={balanceState}
            error={balanceError}
            todayCost={todayCost}
            monthCost={monthCost}
            mimoBalance={null}
            mimoBalanceState="loading"
          />

          <div className="usage-stack">
            <UsageRow
              currentProvider={currentProvider}
              modelKey="flash"
              data={flash}
              maxTokens={maxTokens}
              state={usageState}
              onClick={() => onDetail("flash")}
            />
            <UsageRow
              currentProvider={currentProvider}
              modelKey="pro"
              data={pro}
              maxTokens={maxTokens}
              state={usageState}
              onClick={() => onDetail("pro")}
            />
          </div>

          <UsageChart currentProvider={currentProvider} usage={usage} state={usageState} error={usageError} />
        </>
      ) : (
        <>
          <BalanceCard
            currentProvider={currentProvider}
            balance={null}
            state={mimoBalanceState}
            error={mimoBalanceError}
            todayCost={null}
            monthCost={null}
            mimoBalance={mimoBalance}
            mimoBalanceState={mimoBalanceState}
          />

          <MimoPlanCards plan={mimoPlan} state={mimoPlanState} error={mimoPlanError} />

          <UsageChart currentProvider={currentProvider} usage={usage} state={mimoPlanState} error={mimoPlanError} />
        </>
      )}
    </section>
  );
}

function BalanceCard({
  currentProvider,
  balance,
  state,
  error,
  todayCost,
  monthCost,
  mimoBalance,
  mimoBalanceState,
}: {
  currentProvider: ProviderName;
  balance: BalanceData | null;
  state: BalanceState;
  error: string;
  todayCost: number | null;
  monthCost: number | null;
  mimoBalance: MimoBalanceData | null;
  mimoBalanceState: BalanceState;
}) {
  const isDeepSeek = currentProvider === "deepseek";

  if (!isDeepSeek && mimoBalance) {
    // MIMO balance display
    const statusText =
      mimoBalanceState === "ok"
        ? parseFloat(mimoBalance.totalBalance) > 0
          ? "可用"
          : "余额不足"
        : "—";
    const amount = `${mimoBalance.currency === "USD" ? "$" : "¥"}${mimoBalance.totalBalance}`;

    return (
      <article className="card balance-card">
        <div className="card-title-row">
          <div className="caption-with-icon">
            <CreditCard size={15} />
            <span>MIMO 账户余额</span>
          </div>
          <div className="status-pill">
            <span />
            {statusText}
          </div>
        </div>
        <div className="balance-amount">{amount}</div>
        {mimoBalanceState === "error" && <div className="balance-error">{error}</div>}
        <div className="metric-grid mimo-balance-grid">
          <div className="mini-card">
            <div className="caption-with-icon">
              <SunMedium size={15} />
              <span>现金余额</span>
            </div>
            <strong>{mimoBalance.cashBalance}</strong>
          </div>
          <div className="mini-card">
            <div className="caption-with-icon">
              <CalendarDays size={15} />
              <span>赠送余额</span>
            </div>
            <strong>{mimoBalance.giftBalance}</strong>
          </div>
          <div className="mini-card">
            <div className="caption-with-icon">
              <CreditCard size={15} />
              <span>冻结余额</span>
            </div>
            <strong>{mimoBalance.frozenBalance}</strong>
          </div>
        </div>
      </article>
    );
  }

  // DeepSeek balance display (existing)
  const symbol = balance?.currency === "USD" ? "$" : "¥";
  const amount =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置"
        : state === "error"
          ? "查询失败"
          : `${symbol}${balance?.totalBalance ?? "0.00"}`;
  const statusText = state === "ok" ? (balance?.isAvailable ? "可用" : "余额不足") : "—";
  const statusOff = state === "ok" && balance != null && !balance.isAvailable;

  return (
    <article className="card balance-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          <CreditCard size={15} />
          <span>账户余额</span>
        </div>
        <div className={`status-pill ${statusOff ? "off" : ""}`}>
          <span />
          {statusText}
        </div>
      </div>
      <div className={`balance-amount ${state !== "ok" ? "balance-dim" : ""}`}>{amount}</div>
      {state === "error" && <div className="balance-error">{error}</div>}
      <div className="metric-grid">
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <SunMedium size={15} />
            <span>当日消耗</span>
          </div>
          <strong>{todayCost != null ? fmtMoney(todayCost) : "—"}</strong>
        </div>
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <CalendarDays size={15} />
            <span>本月消费</span>
          </div>
          <strong>{monthCost != null ? fmtMoney(monthCost) : "—"}</strong>
        </div>
      </div>
    </article>
  );
}

function UsageRow({
  currentProvider,
  modelKey,
  data,
  maxTokens,
  state,
  onClick,
}: {
  currentProvider: ProviderName;
  modelKey: ModelName;
  data: UsageModel | null;
  maxTokens: number;
  state: BalanceState;
  onClick: () => void;
}) {
  const isDeepSeek = currentProvider === "deepseek";
  const isFlash = modelKey === "flash";
  const name = isDeepSeek ? (isFlash ? "V4 Flash" : "V4 Pro") : modelKey === "plan" ? "套餐积分" : "补偿积分";
  const tokensText = data
    ? `${fmtInt(data.totalTokens)} Tokens`
    : state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置 Token"
        : state === "error"
          ? "用量不可用"
          : "—";
  const cost = data ? fmtMoney(data.cost) : "—";
  const ratio = data && data.cost > 0 ? `${fmtTokensShort(data.totalTokens / data.cost)} T/¥` : "—";
  const width = data ? `${Math.max(2, (data.totalTokens / maxTokens) * 100)}%` : "0%";

  if (!isDeepSeek && data) {
    // MIMO usage row - show remaining instead of cost/ratio
    const totalAvailable = data.totalTokens + data.cacheHitTokens;
    const used = data.totalTokens;
    const remaining = Math.max(0, totalAvailable - used);
    const progressWidth = totalAvailable > 0 ? `${Math.max(2, (used / totalAvailable) * 100)}%` : "0%";

    return (
      <button className="card usage-row" onClick={onClick}>
        <div className={`model-badge ${modelKey === "plan" ? "flash" : "pro"}`}>
          {modelKey === "plan" ? <Zap size={27} fill="currentColor" /> : <Brain size={25} />}
        </div>
        <div className="usage-main">
          <h2>{name}</h2>
          <div className="token-line">
            <span>{fmtInt(used)} / {fmtInt(totalAvailable)}</span>
            <div className="progress-track">
              <i className={modelKey === "plan" ? "flash-fill" : "pro-fill"} style={{ width: progressWidth }} />
            </div>
          </div>
          <span className={`cache-hit-rate ${modelKey === "plan" ? "flash" : "pro"}`}>
            剩余 {fmtInt(remaining)}
          </span>
        </div>
        <div className="usage-price">
          <strong>{fmtTokensShort(remaining)}</strong>
          <span>剩余</span>
        </div>
      </button>
    );
  }

  // DeepSeek usage row (existing)
  return (
    <button className="card usage-row" onClick={onClick}>
      <div className={`model-badge ${isFlash ? "flash" : "pro"}`}>
        {isFlash ? <Zap size={27} fill="currentColor" /> : <Brain size={25} />}
      </div>
      <div className="usage-main">
        <h2>{name}</h2>
        <div className="token-line">
          <span>{tokensText}</span>
          <div className="progress-track">
            <i className={isFlash ? "flash-fill" : "pro-fill"} style={{ width }} />
          </div>
        </div>
        {data && data.cacheHitTokens + data.cacheMissTokens > 0 && (
          <span className={`cache-hit-rate ${isFlash ? "flash" : "pro"}`}>
            缓存命中{" "}
            {((data.cacheHitTokens / (data.cacheHitTokens + data.cacheMissTokens)) * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="usage-price">
        <strong>{cost}</strong>
        <span>{ratio}</span>
      </div>
    </button>
  );
}

function MimoPlanCards({
  plan,
  state,
  error,
}: {
  plan: MimoPlanItem[] | null;
  state: BalanceState;
  error: string;
}) {
  const placeholder =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置"
        : state === "error"
          ? error
          : "暂无数据";

  return (
    <div className="usage-stack">
      {state === "ok" && plan ? (
        plan.map((item) => {
          const pct = item.total > 0 ? ((item.used / item.total) * 100).toFixed(0) : "0";
          const width = item.total > 0 ? `${Math.max(2, (item.used / item.total) * 100)}%` : "0%";
          const remaining = Math.max(0, item.total - item.used);

          return (
            <div className="card usage-row" key={item.name}>
              <div className={`model-badge ${item.name === "plan" ? "flash" : "pro"}`}>
                {item.name === "plan" ? <Zap size={27} fill="currentColor" /> : <Brain size={25} />}
              </div>
              <div className="usage-main">
                <h2>{item.planName || (item.name === "plan" ? "套餐积分" : "补偿积分")}</h2>
                <div className="token-line">
                  <span>
                    {fmtInt(item.used)} / {fmtInt(item.total)} ({pct}%)
                  </span>
                  <div className="progress-track">
                    <i className={item.name === "plan" ? "flash-fill" : "pro-fill"} style={{ width }} />
                  </div>
                </div>
                <span className={`cache-hit-rate ${item.name === "plan" ? "flash" : "pro"}`}>
                  剩余 {fmtInt(remaining)} tokens
                </span>
              </div>
              <div className="usage-price">
                <strong>{fmtTokensShort(remaining)}</strong>
                <span>剩余</span>
              </div>
            </div>
          );
        })
      ) : (
        <div className="chart-placeholder" style={{ padding: "24px 0" }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}

function UsageChart({
  currentProvider,
  usage,
  state,
  error,
}: {
  currentProvider: ProviderName;
  usage: UsageResult | null;
  state: BalanceState;
  error: string;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const MIN_BAR = 3;
  const isDeepSeek = currentProvider === "deepseek";
  const days = recentUsageDays(usage?.days ?? []);
  const points = days.map((day) => {
    const hit = day.flashCacheHit + day.proCacheHit;
    const miss = day.flashCacheMiss + day.proCacheMiss;
    const response = day.flashResponse + day.proResponse;
    return { date: day.date, hit, miss, response, total: hit + miss + response };
  });
  const maxVal = Math.max(...points.map((point) => point.total), 1);
  const sumHit = points.reduce((sum, point) => sum + point.hit, 0);
  const sumMiss = points.reduce((sum, point) => sum + point.miss, 0);
  const sumTotal = points.reduce((sum, point) => sum + point.total, 0);
  const hitRate = sumHit + sumMiss > 0 ? ((sumHit / (sumHit + sumMiss)) * 100).toFixed(0) : "0";
  const placeholder =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置用量 Token"
        : state === "error"
          ? error
          : "暂无数据";

  return (
    <article className="card chart-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          <BarChart3 size={16} className="brand-blue" />
          <span>{isDeepSeek ? "缓存命中明细" : "Token 用量"}</span>
        </div>
        <span className="chart-total">
          {state === "ok"
            ? isDeepSeek
              ? `命中率 ${hitRate}% · 合计 ${fmtTokensShort(sumTotal)}`
              : `合计 ${fmtTokensShort(sumTotal)}`
            : "—"}
        </span>
      </div>
      {state === "ok" && points.length > 0 ? (
        <>
          <div className="bars" onMouseLeave={() => setHoveredIdx(null)}>
            {points.map((point, idx) => (
              <div className="bar-column" key={point.date}>
                {hoveredIdx === idx && point.total > 0 && (
                  <div
                    className={`bar-tooltip${
                      idx <= 1 ? " align-left" : idx >= points.length - 2 ? " align-right" : ""
                    }`}
                  >
                    <div className="bar-tooltip-head">
                      <span className="bar-tooltip-date">{point.date}</span>
                      <strong>{fmtInt(point.total)} tokens</strong>
                    </div>
                    {isDeepSeek && (
                      <>
                        <span className="bar-tooltip-row">
                          <i className="dot hit" />输入（命中缓存）
                          <strong>{fmtInt(point.hit)} tokens</strong>
                        </span>
                        <span className="bar-tooltip-row">
                          <i className="dot miss" />输入（未命中缓存）
                          <strong>{fmtInt(point.miss)} tokens</strong>
                        </span>
                        <span className="bar-tooltip-row">
                          <i className="dot response" />输出
                          <strong>{fmtInt(point.response)} tokens</strong>
                        </span>
                      </>
                    )}
                  </div>
                )}
                <span className="bar-value">
                  {point.total > 0 ? fmtTokensShort(point.total) : "0"}
                </span>
                <div className="bar-slot">
                  <div
                    className="cache-bar"
                    style={{
                      height: `${point.total > 0 ? Math.max(MIN_BAR, (point.total / maxVal) * 100) : MIN_BAR}%`,
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {point.total > 0 ? (
                      isDeepSeek ? (
                        <>
                          {point.hit > 0 && <i className="seg hit" style={{ flexGrow: point.hit }} />}
                          {point.miss > 0 && <i className="seg miss" style={{ flexGrow: point.miss }} />}
                          {point.response > 0 && (
                            <i className="seg response" style={{ flexGrow: point.response }} />
                          )}
                        </>
                      ) : (
                        <i className="seg response" style={{ flexGrow: point.total }} />
                      )
                    ) : (
                      <i className="seg empty" />
                    )}
                  </div>
                </div>
                <span className="bar-day">{mmdd(point.date)}</span>
              </div>
            ))}
          </div>
          {isDeepSeek && (
            <div className="chart-legend-bottom">
              <span className="chart-legend-item">
                <i className="dot hit" />命中
              </span>
              <span className="chart-legend-item">
                <i className="dot miss" />未命中
              </span>
              <span className="chart-legend-item">
                <i className="dot response" />输出
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="chart-placeholder">{placeholder}</div>
      )}
    </article>
  );
}

function SettingsPanel({
  currentProvider,
  onProviderChange,
  onBack,
  onUsageLoaded,
  onUsageCleared,
  onRefreshIntervalChanged,
  onAutoRefreshChanged,
}: {
  currentProvider: ProviderName;
  onProviderChange: (provider: ProviderName) => void;
  onBack: () => void;
  onUsageLoaded: (usage: UsageResult) => void;
  onUsageCleared: () => void;
  onRefreshIntervalChanged: (seconds: number) => void;
  onAutoRefreshChanged: (enabled: boolean) => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [status, setStatus] = React.useState("正在读取本地配置");
  const [busy, setBusy] = React.useState(false);
  const [refresh, setRefresh] = React.useState(60);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [autostart, setAutostart] = React.useState(false);
  const [usageToken, setUsageToken] = React.useState("");
  const [usageStatus, setUsageStatus] = React.useState("");
  const [usageSyncing, setUsageSyncing] = React.useState(false);
  const [showManualPaste, setShowManualPaste] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState("1.1.0");

  // MIMO cookie states
  const [mimoCookie, setMimoCookie] = React.useState("");
  const [mimoCookieSyncing, setMimoCookieSyncing] = React.useState(false);
  const [mimoCookieStatus, setMimoCookieStatus] = React.useState("");
  const [showMimoManualPaste, setShowMimoManualPaste] = React.useState(false);

  const configPath = config?.configPath ?? "%APPDATA%\\DeepSeekMonitorWindows\\config.json";
  const isDeepSeek = currentProvider === "deepseek";

  React.useEffect(() => {
    void invoke<AppConfig>("get_app_config")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setRefresh(nextConfig.refreshIntervalSeconds || 60);
        setAutoRefresh(nextConfig.autoRefreshEnabled);
        setAutostart(nextConfig.autostart);
        setStatus(nextConfig.apiKeyConfigured ? `已配置 ${nextConfig.apiKeyPreview}` : "未配置 API Key");
        setUsageStatus(nextConfig.usageTokenConfigured ? "用量 Token 已配置" : "未配置用量 Token");
        setMimoCookieStatus(nextConfig.mimoCookieConfigured ? "MIMO Cookie 已配置" : "未配置 MIMO Cookie");
      })
      .catch(() => {
        setStatus("浏览器预览模式，未连接本地配置");
      });
  }, []);

  React.useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("1.1.0"));
  }, []);

  const refreshUsageAfterToken = React.useCallback(
    (prefix: string) => {
      setUsageStatus(`${prefix}，正在刷新用量数据…`);
      return fetchCurrentUsage()
        .then((usage) => {
          onUsageLoaded(usage);
          setUsageStatus(`${prefix}，本月消费 ${fmtMoney(usage.monthCost)}`);
          return usage;
        })
        .catch((error) => {
          const message = typeof error === "string" ? error : "用量刷新失败";
          setUsageStatus(`${prefix}，但用量刷新失败：${message}`);
          throw error;
        });
    },
    [onUsageLoaded],
  );

  React.useEffect(() => {
    const unlistenPromise = listen<AppConfig>("usage-token-captured", (event) => {
      setConfig(event.payload);
      setUsageSyncing(false);
      void refreshUsageAfterToken("已通过网页登录自动同步用量 Token");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshUsageAfterToken]);

  React.useEffect(() => {
    const unlistenPromise = listen("usage-sync-ended", () => {
      setUsageSyncing(false);
      setUsageStatus("登录窗口已关闭，Token 未获取到。可重新点击同步或使用方式二手动粘贴。");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for MIMO cookie captured event
  React.useEffect(() => {
    const unlistenPromise = listen<AppConfig>("mimo-cookie-captured", (event) => {
      setConfig(event.payload);
      setMimoCookieSyncing(false);
      setMimoCookieStatus("已通过网页登录自动同步 MIMO Cookie");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const pasteApiKey = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setApiKey(text.trim());
      setStatus("已从剪贴板读取");
    } catch {
      setStatus("剪贴板读取失败");
    }
  }, []);

  const saveApiKey = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("save_api_key", { apiKey })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setApiKey("");
        setStatus("已保存，正在验证 Key…");
        return invoke<BalanceData>("fetch_balance");
      })
      .then((balance) => {
        const symbol = balance.currency === "USD" ? "$" : "¥";
        const tip = balance.isAvailable ? "" : "（余额不足）";
        setStatus(`验证通过，当前余额 ${symbol}${balance.totalBalance}${tip}`);
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : "保存或验证失败");
      })
      .finally(() => setBusy(false));
  }, [apiKey]);

  const clearApiKey = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("clear_api_key")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setApiKey("");
        setStatus("已清除 API Key");
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : "清除失败");
      })
      .finally(() => setBusy(false));
  }, []);

  const pasteUsageToken = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUsageToken(text.trim());
      setUsageStatus("已从剪贴板读取");
    } catch {
      setUsageStatus("剪贴板读取失败");
    }
  }, []);

  const startUsageSync = React.useCallback(() => {
    setUsageSyncing(true);
    setUsageStatus("正在打开登录窗口…");
    void invoke<boolean>("start_usage_sync")
      .then((synced) => {
        if (!synced) {
          setUsageStatus("登录完成后，再次点击本按钮即可同步用量（可多点几次）");
        }
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "打开登录窗口失败");
      })
      .finally(() => {
        window.setTimeout(() => setUsageSyncing(false), 2500);
      });
  }, []);

  const saveUsageToken = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("save_usage_token", { usageToken })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setUsageToken("");
        setUsageStatus("已保存，正在验证用量 Token…");
        return refreshUsageAfterToken("手动 Token 已保存");
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "保存或验证失败");
      })
      .finally(() => setBusy(false));
  }, [refreshUsageAfterToken, usageToken]);

  const clearUsageToken = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("clear_usage_token")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setUsageToken("");
        setUsageStatus("已清除用量 Token");
        onUsageCleared();
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "清除失败");
      })
      .finally(() => setBusy(false));
  }, [onUsageCleared]);

  // MIMO cookie actions
  const pasteMimoCookie = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setMimoCookie(text.trim());
      setMimoCookieStatus("已从剪贴板读取");
    } catch {
      setMimoCookieStatus("剪贴板读取失败");
    }
  }, []);

  const startMimoSync = React.useCallback(() => {
    setMimoCookieSyncing(true);
    setMimoCookieStatus("正在打开登录窗口…");
    void invoke<boolean>("start_mimo_sync")
      .then((synced) => {
        if (!synced) {
          setMimoCookieStatus("登录完成后，再次点击本按钮即可同步 Cookie");
        }
      })
      .catch((error) => {
        setMimoCookieStatus(typeof error === "string" ? error : "打开登录窗口失败");
      })
      .finally(() => {
        window.setTimeout(() => setMimoCookieSyncing(false), 2500);
      });
  }, []);

  const saveMimoCookie = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("save_mimo_cookie", { mimoCookie })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setMimoCookie("");
        setMimoCookieStatus("MIMO Cookie 已保存");
      })
      .catch((error) => {
        setMimoCookieStatus(typeof error === "string" ? error : "保存失败");
      })
      .finally(() => setBusy(false));
  }, [mimoCookie]);

  const clearMimoCookie = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("clear_mimo_cookie")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setMimoCookie("");
        setMimoCookieStatus("已清除 MIMO Cookie");
      })
      .catch((error) => {
        setMimoCookieStatus(typeof error === "string" ? error : "清除失败");
      })
      .finally(() => setBusy(false));
  }, []);

  const saveRefreshInterval = React.useCallback(
    (seconds: number) => {
      const previous = refresh;
      setRefresh(seconds);
      onRefreshIntervalChanged(seconds);
      void invoke<AppConfig>("save_refresh_interval", { refreshIntervalSeconds: seconds })
        .then((nextConfig) => {
          setConfig(nextConfig);
          setRefresh(nextConfig.refreshIntervalSeconds || 60);
          onRefreshIntervalChanged(nextConfig.refreshIntervalSeconds || 60);
        })
        .catch(() => {
          setRefresh(previous);
          onRefreshIntervalChanged(previous);
        });
    },
    [onRefreshIntervalChanged, refresh],
  );

  const saveAutoRefreshEnabled = React.useCallback(
    (enabled: boolean) => {
      const previous = autoRefresh;
      setAutoRefresh(enabled);
      onAutoRefreshChanged(enabled);
      void invoke<AppConfig>("save_auto_refresh_enabled", { autoRefreshEnabled: enabled })
        .then((nextConfig) => {
          setConfig(nextConfig);
          setAutoRefresh(nextConfig.autoRefreshEnabled);
          onAutoRefreshChanged(nextConfig.autoRefreshEnabled);
        })
        .catch(() => {
          setAutoRefresh(previous);
          onAutoRefreshChanged(previous);
        });
    },
    [autoRefresh, onAutoRefreshChanged],
  );

  const saveAutostart = React.useCallback((enabled: boolean) => {
    const previous = autostart;
    setAutostart(enabled);
    void invoke<AppConfig>("save_autostart", { autostart: enabled })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setAutostart(nextConfig.autostart);
      })
      .catch(() => setAutostart(previous));
  }, [autostart]);

  const providerIcon = isDeepSeek ? <BrandIcon size={42} /> : <MimoBrandIcon size={42} />;
  const settingsTitle = isDeepSeek ? "DeepSeek Monitor" : "MiMo Monitor";

  return (
    <section className="settings-panel" data-testid="settings-panel">
      <button className="floating-close settings-close" onClick={onBack} aria-label="返回主面板">
        <X size={20} />
      </button>
      <div className="settings-inner">
        <header className="settings-header" data-tauri-drag-region>
          {providerIcon}
          <div>
            <h1>{settingsTitle}</h1>
            <p>设置</p>
          </div>
        </header>

        <SettingsSection icon={<ArrowLeftRight size={15} />} title="服务商切换">
          <p>当前服务商：{isDeepSeek ? "DeepSeek" : "小米 MIMO"}</p>
          <ProviderSwitch currentProvider={currentProvider} onChange={onProviderChange} />
        </SettingsSection>

        {isDeepSeek ? (
          <>
            <SettingsSection icon={<KeyRound size={15} />} title="API Key">
              <p>用于调用 DeepSeek API 获取余额和用量数据。当前 Windows 版本会保存在应用本地设置中。</p>
              <p className="muted">API Key 只在当前这台 Windows 电脑本地保留。</p>
              <p className="muted config-path">
                <span>本地位置：</span>
                <span>{configPath}</span>
              </p>
              <div className="key-row">
                <input
                  aria-label="API Key"
                  type="password"
                  value={apiKey}
                  placeholder={config?.apiKeyConfigured ? "••••••••••••••••••••••••••••••••••••••••••••••••••" : "sk-..."}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              <div className="settings-actions">
                <button className="primary" onClick={saveApiKey} disabled={busy || !apiKey.trim()}>
                  验证并保存
                </button>
                <span className={config?.apiKeyConfigured ? "configured" : "configured muted-status"}>
                  <CheckCircle2 size={17} />
                  {config?.apiKeyConfigured ? "已配置" : "未配置"}
                </span>
                <button className="secondary" onClick={clearApiKey} disabled={busy || !config?.apiKeyConfigured}>
                  清除 Key
                </button>
              </div>
            </SettingsSection>

            <SettingsSection icon={<BarChart3 size={15} />} title="用量同步 Token">
              <p>用于同步 Token 用量、消费和趋势图。DeepSeek 无官方用量 API，需网页登录 token（与上面的 API Key 不同）。</p>
              <p className="muted">方式一网页登录自动同步</p>
              <div className="settings-actions usage-sync-actions">
                <button className="primary" onClick={startUsageSync} disabled={usageSyncing}>
                  {usageSyncing ? "等待登录" : "网页登录自动同步"}
                </button>
                <span className={config?.usageTokenConfigured ? "configured" : "configured muted-status"}>
                  <CheckCircle2 size={17} />
                  {config?.usageTokenConfigured ? "已配置" : "未配置"}
                </span>
                <button className="secondary" onClick={clearUsageToken} disabled={busy || !config?.usageTokenConfigured}>
                  清除 Token
                </button>
              </div>
              <p className="muted">{usageStatus}</p>
              <button
                className="link-button"
                onClick={() => setShowManualPaste((value) => !value)}
              >
                {showManualPaste ? "收起手动粘贴" : "方式二：手动粘贴 token"}
              </button>
              {showManualPaste && (
                <>
                  <p className="muted">
                    获取：浏览器登录 platform.deepseek.com，按 F12 打开控制台，输入
                    JSON.parse(localStorage.userToken).value 回车，复制返回的字符串。
                  </p>
                  <p className="muted">token 会过期，用量查询失败时重新获取一次即可。</p>
                  <div className="key-row">
                    <input
                      aria-label="用量 Token"
                      type="password"
                      value={usageToken}
                      placeholder={config?.usageTokenConfigured ? "••••••••••••••••••••••••••••••••••••••••••••••••••" : ""}
                      onChange={(event) => setUsageToken(event.target.value)}
                    />
                  </div>
                  <div className="settings-actions">
                    <button className="primary" onClick={saveUsageToken} disabled={busy || !usageToken.trim()}>
                      保存 Token
                    </button>
                  </div>
                </>
              )}
            </SettingsSection>
          </>
        ) : (
          <>
            <SettingsSection icon={<KeyRound size={15} />} title="MIMO Cookie">
              <p>用于获取小米 MIMO 平台的余额和用量数据。需要配置浏览器 Cookie 信息。</p>
              <p className="muted">方式一网页登录自动同步</p>
              <div className="settings-actions usage-sync-actions">
                <button className="primary" onClick={startMimoSync} disabled={mimoCookieSyncing}>
                  {mimoCookieSyncing ? "等待登录" : "网页登录自动同步"}
                </button>
                <span className={config?.mimoCookieConfigured ? "configured" : "configured muted-status"}>
                  <CheckCircle2 size={17} />
                  {config?.mimoCookieConfigured ? "已配置" : "未配置"}
                </span>
                <button className="secondary" onClick={clearMimoCookie} disabled={busy || !config?.mimoCookieConfigured}>
                  清除 Cookie
                </button>
              </div>
              <p className="muted">{mimoCookieStatus}</p>
              <button
                className="link-button"
                onClick={() => setShowMimoManualPaste((value) => !value)}
              >
                {showMimoManualPaste ? "收起手动粘贴" : "方式二：手动粘贴 Cookie"}
              </button>
              {showMimoManualPaste && (
                <>
                  <p className="muted">
                    从浏览器开发者工具中复制 MIMO 平台的完整 Cookie 字符串，粘贴到下方输入框中保存。
                  </p>
                  <div className="key-row">
                    <input
                      aria-label="MIMO Cookie"
                      type="password"
                      value={mimoCookie}
                      placeholder={config?.mimoCookieConfigured ? "••••••••••••••••••••••••••••••••••••••••••••••••••" : ""}
                      onChange={(event) => setMimoCookie(event.target.value)}
                    />
                  </div>
                  <div className="settings-actions">
                    <button className="primary" onClick={saveMimoCookie} disabled={busy || !mimoCookie.trim()}>
                      保存 Cookie
                    </button>
                  </div>
                </>
              )}
            </SettingsSection>
          </>
        )}

        <SettingsSection icon={<Power size={15} />} title="开机自启">
          <p>开启后，每次登录 Windows 时自动启动 {isDeepSeek ? "DeepSeek" : "MiMo"} Monitor。</p>
          <Toggle label="登录时自动启动" checked={autostart} onChange={saveAutostart} />
        </SettingsSection>

        <SettingsSection icon={<RefreshCw size={15} />} title="自动刷新">
          <p>开启后，按设定周期自动从{isDeepSeek ? " DeepSeek API" : " MIMO 平台"}拉取最新数据。</p>
          <Toggle label="启用自动刷新" checked={autoRefresh} onChange={saveAutoRefreshEnabled} />
          {autoRefresh && (
            <div className="segmented">
              {refreshOptions.map((option) => (
                <button
                  key={option.value}
                  className={refresh === option.value ? "selected" : ""}
                  onClick={() => saveRefreshInterval(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={<Info size={15} />} title="关于">
          <div className="version-row">
            <span>当前版本</span>
            <strong>v{appVersion}</strong>
          </div>
        </SettingsSection>

      </div>
    </section>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function ModelDetailPanel({
  currentProvider,
  model,
  usage,
  usageState,
  onBack,
}: {
  currentProvider: ProviderName;
  model: ModelName;
  usage: UsageResult | null;
  usageState: BalanceState;
  onBack: () => void;
}) {
  const isDeepSeek = currentProvider === "deepseek";
  const isFlash = model === "flash";
  const data = usage?.models.find((item) => item.key === model) ?? null;

  const title = isDeepSeek
    ? isFlash
      ? "V4 Flash"
      : "V4 Pro"
    : model === "plan"
      ? "套餐积分"
      : "补偿积分";

  const tintClass = isDeepSeek ? (isFlash ? "flash" : "pro") : model === "plan" ? "flash" : "pro";
  const cost = data ? fmtMoney(data.cost) : "—";
  const totalText = data ? fmtTokensShort(data.totalTokens) : "—";

  const days = recentUsageDays(usage?.days ?? []);
  const points = days.map((day) => {
    const hit = isDeepSeek ? (isFlash ? day.flashCacheHit : day.proCacheHit) : 0;
    const miss = isDeepSeek ? (isFlash ? day.flashCacheMiss : day.proCacheMiss) : 0;
    const response = isDeepSeek ? (isFlash ? day.flashResponse : day.proResponse) : 0;
    return { date: day.date, hit, miss, response, total: hit + miss + response };
  });
  const maxVal = Math.max(...points.map((point) => point.total), 1);
  const rangeText =
    points.length > 0 ? `${mmdd(points[0].date)} - ${mmdd(points[points.length - 1].date)}` : "";

  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const MIN_BAR = 3;

  return (
    <section className="panel detail-panel" data-testid="detail-panel">
      <button className="floating-close" onClick={onBack} aria-label="返回主面板">
        <X size={20} />
      </button>
      <article className="card detail-hero" data-tauri-drag-region>
        <div className={`model-badge large ${tintClass}`}>
          {tintClass === "flash" ? <Zap size={34} fill="currentColor" /> : <Brain size={33} />}
        </div>
        <div>
          <h1>{title}</h1>
          <p>{isDeepSeek ? cost : totalText}</p>
        </div>
      </article>

      <div className="detail-metrics">
        <article className="card metric-card">
          <span>{isDeepSeek ? "API 请求次数" : "已使用"}</span>
          <strong className={tintClass}>{data ? fmtInt(data.requestCount) : "—"}</strong>
        </article>
        <article className="card metric-card">
          <span>Tokens</span>
          <strong className={tintClass}>{totalText}</strong>
        </article>
      </div>

      <article className="card detail-chart">
        <div className="detail-chart-head">
          <div>
            <h2>按日 Token 消耗</h2>
            <span>{rangeText}</span>
          </div>
        </div>
        {usageState === "ok" && points.length > 0 ? (
          <>
            <div className="detail-bars" onMouseLeave={() => setHoveredIdx(null)}>
              {points.map((point, idx) => (
                <div className="detail-bar-column" key={point.date}>
                  {hoveredIdx === idx && point.total > 0 && (
                    <div
                      className={`bar-tooltip${
                        idx <= 1 ? " align-left" : idx >= points.length - 2 ? " align-right" : ""
                      }`}
                    >
                      <div className="bar-tooltip-head">
                        <span className="bar-tooltip-date">{point.date}</span>
                        <strong>{fmtInt(point.total)} tokens</strong>
                      </div>
                      {isDeepSeek && (
                        <>
                          <span className="bar-tooltip-row">
                            <i className="dot hit" />输入（命中缓存）
                            <strong>{fmtInt(point.hit)} tokens</strong>
                          </span>
                          <span className="bar-tooltip-row">
                            <i className="dot miss" />输入（未命中缓存）
                            <strong>{fmtInt(point.miss)} tokens</strong>
                          </span>
                          <span className="bar-tooltip-row">
                            <i className="dot response" />输出
                            <strong>{fmtInt(point.response)} tokens</strong>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  <span>{point.total > 0 ? fmtTokensShort(point.total) : ""}</span>
                  <div className="detail-bar-slot">
                    <div
                      className="detail-bar-stacked"
                      style={{
                        height: `${point.total > 0 ? Math.max(MIN_BAR, (point.total / maxVal) * 100) : MIN_BAR}%`,
                      }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      {point.total > 0 ? (
                        isDeepSeek ? (
                          <>
                            {point.hit > 0 && <i className="seg hit" style={{ flexGrow: point.hit }} />}
                            {point.miss > 0 && <i className="seg miss" style={{ flexGrow: point.miss }} />}
                            {point.response > 0 && <i className="seg response" style={{ flexGrow: point.response }} />}
                          </>
                        ) : (
                          <i className="seg response" style={{ flexGrow: point.total }} />
                        )
                      ) : (
                        <i className="seg empty" />
                      )}
                    </div>
                  </div>
                  <em>{mmdd(point.date)}</em>
                </div>
              ))}
            </div>
            {isDeepSeek && (
              <div className="chart-legend-bottom">
                <span className="chart-legend-item"><i className="dot hit" />命中</span>
                <span className="chart-legend-item"><i className="dot miss" />未命中</span>
                <span className="chart-legend-item"><i className="dot response" />输出</span>
              </div>
            )}
          </>
        ) : (
          <div className="chart-placeholder">
            {usageState === "nokey" ? "未配置用量 Token" : usageState === "loading" ? "查询中…" : "暂无数据"}
          </div>
        )}
      </article>
    </section>
  );
}

// Apply the saved theme before first render to avoid a flash of the wrong skin.
document.documentElement.setAttribute("data-theme", localStorage.getItem("ui-theme") || "dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

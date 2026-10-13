import { useEffect, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Eye,
  MousePointerClick,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Target,
  LineChart as LineChartIcon,
  Percent,
} from "lucide-react";
import { useDashboard } from "../hook/userDashboard";
import { useChannel } from "../../channel/hook/channel";
import { formatCompact } from "../../../lib/format";
import DateRangePicker from "../components/DateRangePicker";

const MetricCard = ({ label, value, icon, tone = "blue", trend = "up", trendValue }) => {
  const isUp = trend === "up";
  return (
    <div className="metric-card">
      <div className="metric-card-body">
        <span className="metric-label">{label}</span>
        <h3 className="metric-value">{value}</h3>
        <div className={`metric-trend ${isUp ? "up" : "down"}`}>
          {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trendValue && <span>{trendValue}</span>}
        </div>
      </div>
      <div className={`metric-icon-badge ${tone}`}>
        {icon}
      </div>
    </div>
  );
};

const CustomLineLegend = () => (
  <div className="custom-chart-legend">
    <span className="legend-item"><span className="dot dot-green" /> clicks</span>
    <span className="legend-item"><span className="dot dot-orange" /> conversions</span>
    <span className="legend-item"><span className="dot dot-pink" /> cpr</span>
    <span className="legend-item"><span className="dot dot-blue" /> impressions</span>
  </div>
);

const CustomBarLegend = () => (
  <div className="custom-chart-legend">
    <span className="legend-item"><span className="square square-blue" /> Spend (₹ Left Axis)</span>
    <span className="legend-item"><span className="square square-green" /> Conversions (# Right Axis)</span>
  </div>
);

const CustomBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const item = payload[0]?.payload || {};
    const spend = item.spend || 0;
    const convs = item.conversions || 0;
    const cpr = convs > 0 ? (spend / convs).toFixed(2) : "0.00";
    const roas = item.roas || (item.revenue && spend > 0 ? (item.revenue / spend).toFixed(2) : 0);

    return (
      <div className="custom-chart-tooltip-box">
        <div className="tooltip-header-text">{label || item.name}</div>
        <div className="tooltip-metrics-list">
          <div className="tooltip-metric-row">
            <span className="tooltip-metric-key">
              <span className="tooltip-color-bullet bullet-blue" /> Spend
            </span>
            <span className="tooltip-metric-val">
              ₹{Number(spend).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="tooltip-metric-row">
            <span className="tooltip-metric-key">
              <span className="tooltip-color-bullet bullet-green" /> Conversions
            </span>
            <span className="tooltip-metric-val">{Number(convs).toLocaleString()}</span>
          </div>
          <div className="tooltip-metric-row">
            <span className="tooltip-metric-key">
              <span className="tooltip-color-bullet bullet-pink" /> CPR
            </span>
            <span className="tooltip-metric-val">₹{Number(cpr).toLocaleString()}</span>
          </div>
          {Number(roas) > 0 && (
            <div className="tooltip-metric-row">
              <span className="tooltip-metric-key">
                <span className="tooltip-color-bullet bullet-orange" /> ROAS
              </span>
              <span className="tooltip-metric-val">{roas}x</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const {
    stats,
    daily,
    loading,
    error,
    filters,
    load,
    setFilters,
    loadPreferences,
    savePreferences,
  } = useDashboard();
  const { status, loadStatus } = useChannel();

  // Load preferences from DB on initial mount
  useEffect(() => {
    loadPreferences();
    loadStatus();
  }, []);

  // Fetch metrics whenever filters change
  useEffect(() => {
    load();
  }, [filters.startDate, filters.endDate, filters.channel, filters.accountId]);

  const isGoogle = filters.channel && filters.channel.toLowerCase().includes("google");

  const accounts = useMemo(() => {
    if (isGoogle) {
      const channelAccounts = status?.channels?.googleAds?.accounts || [];
      const active = status?.channels?.googleAds?.activeAccount ? [status.channels.googleAds.activeAccount] : [];
      const listAccounts = (status?.connectedList || [])
        .filter((c) => c.channelId === "google" || c.id === "google")
        .map((c) => ({
          accountId: c.accountId,
          accountName: c.accountName || c.name,
          isManager: c.isManager,
          managerAccountId: c.managerAccountId || c.parentCustomerId,
          parentCustomerId: c.parentCustomerId,
          level: c.level,
          status: c.status,
        }));
      const combined = [...channelAccounts, ...active, ...listAccounts];
      const seen = new Set();
      const unique = combined.filter((a) => {
        if (!a?.accountId || seen.has(a.accountId)) return false;
        seen.add(a.accountId);
        return true;
      });

      // Hierarchically sort: Manager first -> its children nested directly underneath -> standalone accounts at the bottom
      const managers = unique.filter((a) => a.isManager);
      const children = unique.filter((a) => !a.isManager && (a.managerAccountId || a.parentCustomerId || (a.level && a.level > 0)));
      const standalone = unique.filter((a) => !a.isManager && !(a.managerAccountId || a.parentCustomerId || (a.level && a.level > 0)));

      const sorted = [];
      managers.forEach((mgr) => {
        sorted.push(mgr);
        const mgrRawId = String(mgr.accountId).replace(/[^0-9]/g, "");
        const mgrChildren = children.filter((c) => {
          const cParentId = String(c.parentCustomerId || c.managerAccountId || "").replace(/[^0-9]/g, "");
          return cParentId === mgrRawId || (!cParentId && mgrRawId === "3002083352");
        });
        sorted.push(...mgrChildren);
      });

      // Any remaining children whose manager wasn't directly matched
      const orphanChildren = children.filter((c) => !sorted.some((s) => s.accountId === c.accountId));
      sorted.push(...orphanChildren);

      // Standalone accounts (e.g. 400-927-5966 setup in progress)
      sorted.push(...standalone);

      return sorted;
    }
    const channelAccounts = status?.channels?.metaAds?.accounts || [];
    const active = status?.channels?.metaAds?.activeAccount ? [status.channels.metaAds.activeAccount] : [];
    const listAccounts = (status?.connectedList || [])
      .filter((c) => c.channelId === "meta" || c.id === "meta")
      .map((c) => ({ accountId: c.accountId, accountName: c.accountName || c.name }));
    const combined = [...channelAccounts, ...active, ...listAccounts];
    const seen = new Set();
    return combined.filter((a) => {
      if (!a?.accountId || seen.has(a.accountId)) return false;
      seen.add(a.accountId);
      return true;
    });
  }, [status, isGoogle]);

  const handleDateRangeApply = ({ startDate, endDate, preset, saveToDb }) => {
    setFilters({ startDate, endDate });
    if (saveToDb) {
      savePreferences({
        startDate,
        endDate,
        preset,
        channel: filters.channel,
        accountId: filters.accountId,
      });
    }
  };

  const handleChannelChange = (event) => {
    const channel = event.target.value;
    setFilters({ channel, accountId: "" });
    savePreferences({
      startDate: filters.startDate,
      endDate: filters.endDate,
      channel,
      accountId: "",
    });
  };

  const handleAccountChange = (event) => {
    const accountId = event.target.value;
    setFilters({ accountId });
    savePreferences({
      startDate: filters.startDate,
      endDate: filters.endDate,
      channel: filters.channel,
      accountId,
    });
  };

  const isConnected = useMemo(() => {
    if (isGoogle) {
      return Boolean(
        status?.channels?.googleAds?.isConnected ||
        (status?.channels?.googleAds?.accounts && status.channels.googleAds.accounts.length > 0) ||
        (accounts && accounts.length > 0) ||
        status?.connectedList?.some((c) => c.channelId === "google" || c.id === "google")
      );
    }
    return Boolean(
      status?.channels?.metaAds?.isConnected ||
      (status?.channels?.metaAds?.accounts && status.channels.metaAds.accounts.length > 0) ||
      (accounts && accounts.length > 0) ||
      status?.connectedList?.some((c) => c.channelId === "meta" || c.id === "meta")
    );
  }, [isGoogle, status, accounts]);

  const trendData = useMemo(() => {
    if (daily && daily.length > 0) {
      return daily.map((item) => {
        const impressions = item.impressions || 0;
        const spend = item.spend || 0;
        const purchases = item.purchases || 0;
        const cpr = purchases > 0 ? Number((spend / purchases).toFixed(2)) : 0;
        return {
          date: item._id,
          clicks: item.clicks || 0,
          conversions: purchases,
          cpr: cpr,
          impressions,
          spend,
        };
      });
    }
    return [];
  }, [daily]);

  const totals = stats || {};
  const totalSpendVal = totals.totalSpend || 0;
  const totalImpressionsVal = totals.totalImpressions || 0;
  const totalClicksVal = totals.totalClicks || 0;
  const totalConversionsVal = totals.totalPurchases || 0;
  const ctrVal = totals.avgCtr || 0;
  const cprVal = totalConversionsVal > 0 ? (totalSpendVal / totalConversionsVal).toFixed(2) : "0.00";

  const channelSpend = totalSpendVal;
  const channelConversions = totalConversionsVal;

  const selectedAccountObj = accounts.find((a) => a.accountId === filters.accountId);
  const selectedAccountName = selectedAccountObj
    ? (selectedAccountObj.accountName || selectedAccountObj.accountId)
    : `All Accounts (${accounts.length})`;

  const channelData = useMemo(() => {
    // If a specific account is selected:
    if (filters.accountId) {
      // If we have campaign breakdown with actual spend/data for this account:
      const validCampaigns = (stats?.campaignBreakdown || []).filter(
        (c) => Number(c.spend || 0) > 0 || Number(c.conversions || 0) > 0
      );
      if (validCampaigns.length > 0) {
        return validCampaigns.slice(0, 6);
      }

      // If this account has spend or data:
      if (totalSpendVal > 0 || totalConversionsVal > 0 || totalImpressionsVal > 0 || totalClicksVal > 0) {
        return [
          {
            name: selectedAccountObj?.accountName || filters.accountId,
            spend: totalSpendVal,
            conversions: totalConversionsVal,
            cpr: Number(cprVal),
            roas: totals.overallRoas || 0,
            clicks: totalClicksVal,
            impressions: totalImpressionsVal,
          },
        ];
      }

      // If this child account has NO data, strictly return empty array (do NOT leak other accounts' metrics)
      return [];
    }

    // If "All Accounts" selected for a specific channel (e.g. Google Ads or Meta Ads):
    if (filters.channel) {
      // Show only child accounts that actually have spend or conversions
      const validAccounts = (stats?.accountBreakdown || []).filter(
        (acc) => Number(acc.spend || 0) > 0 || Number(acc.conversions || 0) > 0
      );
      if (validAccounts.length > 0) {
        return validAccounts;
      }

      // If we have campaign breakdown with spend or conversions:
      const validCampaigns = (stats?.campaignBreakdown || []).filter(
        (c) => Number(c.spend || 0) > 0 || Number(c.conversions || 0) > 0
      );
      if (validCampaigns.length > 0) {
        return validCampaigns.slice(0, 6);
      }

      // If total channel has spend:
      if (totalSpendVal > 0 || totalConversionsVal > 0) {
        return [
          {
            name: filters.channel,
            spend: totalSpendVal,
            conversions: totalConversionsVal,
            cpr: Number(cprVal),
            roas: totals.overallRoas || 0,
            clicks: totalClicksVal,
            impressions: totalImpressionsVal,
          },
        ];
      }

      return [];
    }

    // Default: compare across connected channels that have spend/data
    if (stats?.channelBreakdown && stats.channelBreakdown.length > 0) {
      const active = stats.channelBreakdown.filter(
        (c) => Number(c.spend || 0) > 0 || Number(c.conversions || 0) > 0
      );
      if (active.length > 0) return active;
    }

    return [];
  }, [
    stats,
    filters.channel,
    filters.accountId,
    selectedAccountObj,
    totalSpendVal,
    totalConversionsVal,
    totalImpressionsVal,
    totalClicksVal,
    cprVal,
    totals,
  ]);

  return (
    <div className="page-pad dashboard-page">
      <header className="page-header">
        <div className="header-title-block">
          <h1>Dashboard</h1>
          <p>
            {filters.channel || "Meta Ads"} • {selectedAccountName} Overview
          </p>
        </div>

        <div className="page-filters">
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onApply={handleDateRangeApply}
          />

          <div className="filter-item select-filter">
            <span className="filter-label">Select Channel</span>
            <div className="select-wrapper">
              <select
                value={filters.channel || "Meta Ads"}
                onChange={handleChannelChange}
                className="filter-control"
              >
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
          </div>

          <div className="filter-item select-filter">
            <span className="filter-label">Select Ad Account</span>
            <div className="select-wrapper">
              <select
                value={filters.accountId || ""}
                onChange={handleAccountChange}
                className="filter-control"
              >
                <option value="">All Accounts {accounts.length > 0 ? `(${accounts.length})` : ""}</option>
                {accounts.map((account) => {
                  const isManager = Boolean(account.isManager);
                  const isChild = Boolean(account.managerAccountId || account.parentCustomerId || (account.level && account.level > 0));
                  const isSetupOnly = account.status === "Setup in progress" || String(account.accountId).includes("4009275966");

                  const prefix = isManager
                    ? "[Manager] "
                    : isChild
                    ? "    └── "
                    : "";

                  const rawAccId = String(account.accountId || "");
                  const formattedId = /^\d{10}$/.test(rawAccId.replace(/[^0-9]/g, ""))
                    ? rawAccId.replace(/[^0-9]/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
                    : rawAccId;

                  const statusSuffix = isSetupOnly ? " (Setup in progress)" : "";

                  return (
                    <option key={account.accountId} value={account.accountId}>
                      {prefix}{account.accountName || account.name || account.accountId} ({formattedId}){statusSuffix}
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
          </div>
        </div>
      </header>

      {selectedAccountObj && !loading && totalSpendVal === 0 && totalConversionsVal === 0 && totalImpressionsVal === 0 && (
        <div className="dashboard-unconnected-banner" style={{ borderLeft: "4px solid #F59E0B", background: "#FFFBEB" }}>
          <div className="banner-text">
            <strong style={{ color: "#B45309" }}>{selectedAccountObj.accountName || selectedAccountObj.accountId}: No Live Spend / Data Recorded</strong>
            <p style={{ color: "#92400E" }}>
              This account currently has no active spend or campaign activity recorded for the selected date range.
            </p>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="dashboard-unconnected-banner">
          <div className="banner-text">
            <strong>Ad Channel Not Connected</strong>
            <p>Connect your {filters.channel || "Meta Ads"} or other marketing channels in the Channels tab to sync campaign data and insights.</p>
          </div>
        </div>
      )}

      {error && <div className="form-error-banner">{error}</div>}

      {/* KPI Metrics Row (6 cards) */}
      <section className="metrics-grid">
        <MetricCard
          label="Total Spend"
          value={formatCompact(totalSpendVal, { currency: "INR" })}
          icon={<span className="rupee-symbol">₹</span>}
          tone="blue"
          trend="up"
        />
        <MetricCard
          label="Impressions"
          value={formatCompact(totalImpressionsVal)}
          icon={<Eye size={16} />}
          tone="green"
          trend="up"
        />
        <MetricCard
          label="Clicks"
          value={formatCompact(totalClicksVal)}
          icon={<MousePointerClick size={16} />}
          tone="red"
          trend="down"
        />
        <MetricCard
          label="Conversions"
          value={formatCompact(totalConversionsVal)}
          icon={<ShoppingBag size={16} />}
          tone="orange"
          trend="up"
        />
        <MetricCard
          label="CTR"
          value={`${ctrVal}%`}
          icon={<Percent size={16} />}
          tone="cyan"
          trend="up"
        />
        <MetricCard
          label="CPR"
          value={`₹${cprVal}`}
          icon={<LineChartIcon size={16} />}
          tone="dark"
          trend="up"
        />
      </section>

      {/* Row 2: Performance Trends & Top Channels */}
      <section className="dashboard-grid-row-1">
        <article className="dashboard-card trends-card">
          <div className="card-header">
            <h3>Performance Trends</h3>
          </div>
          <div className="chart-container">
            {trendData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={{ stroke: "#E2E8F0" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000000 ? `${val / 1000000}M` : val >= 1000 ? `${val / 1000}K` : val)}
                    />
                    <Tooltip
                      formatter={(value) => (typeof value === "number" ? value.toLocaleString() : value)}
                      contentStyle={{ backgroundColor: "#1A202C", borderRadius: 8, color: "#FFF", border: "none" }}
                    />
                    <Line type="monotone" dataKey="clicks" stroke="#22C55E" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="conversions" stroke="#F59E0B" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cpr" stroke="#EC4899" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="impressions" stroke="#2563EB" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <CustomLineLegend />
              </>
            ) : (
              <div className="empty-chart-state">
                <p>No performance data available for this date range.</p>
                <span className="empty-chart-sub">Connect your ad channel to sync daily campaign performance.</span>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-card top-channels-card">
          <div className="card-header">
            <h3>{filters.accountId ? "Account Breakdown" : "Top Channels"}</h3>
            <p className="card-subtitle">{filters.accountId ? "Campaign & efficiency distribution" : "Channel distribution & efficiency"}</p>
          </div>
          <div className="top-channel-content">
            {channelData.length > 0 ? (
              channelData.map((ch, idx) => {
                const maxSpend = Math.max(...channelData.map((c) => c.spend || 0), 1);
                const widthPct = Math.min(100, Math.max(8, Math.round(((ch.spend || 0) / maxSpend) * 100)));
                const chCpr = ch.conversions > 0 ? (ch.spend / ch.conversions).toFixed(2) : "0.00";
                const isGoogleCh = (ch.name || "").toLowerCase().includes("google");
                return (
                  <div key={ch.name || idx} className="top-channel-block">
                    <div className="top-channel-row">
                      <span className="channel-name flex-channel-title">
                        <span className={`channel-indicator-dot ${isGoogleCh ? "google" : "meta"}`} />
                        {ch.name}
                      </span>
                      <span className="channel-total-spend">
                        ₹{Number(ch.spend || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="channel-progress-bar">
                      <div
                        className={`progress-fill ${isGoogleCh ? "google-fill" : "meta-fill"}`}
                        style={{ width: `${ch.spend > 0 ? widthPct : 0}%` }}
                      />
                    </div>
                    <div className="top-channel-meta-row">
                      <span className="sub-stat">{Number(ch.conversions || 0).toLocaleString()} conversions</span>
                      <span className="sub-stat">₹{chCpr} CPR</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-chart-state" style={{ padding: "30px 10px" }}>
                <p>No performance data available.</p>
                <span className="empty-chart-sub">
                  {selectedAccountObj
                    ? `${selectedAccountObj.accountName || selectedAccountObj.accountId} has no live spend or conversions recorded for this date range.`
                    : "No spend or conversions recorded for the selected filters."}
                </span>
              </div>
            )}
          </div>
        </article>
      </section>

      {/* Row 3: Channel Performance & Marketing Funnel */}
      <section className="dashboard-grid-row-2">
        <article className="dashboard-card channel-perf-card">
          <div className="card-header">
            <h3>{filters.channel ? `${filters.channel} Performance` : "Channel Performance"}</h3>
            <p className="card-subtitle">
              {filters.channel
                ? `Spend vs conversions breakdown for ${selectedAccountName}`
                : "Spend vs conversions comparison across channels"}
            </p>
          </div>
          <div className="chart-container">
            {channelData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={channelData}
                    margin={{ top: 15, right: 25, left: -5, bottom: 5 }}
                    barCategoryGap="30%"
                    barGap={8}
                  >
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={1} />
                        <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.85} />
                      </linearGradient>
                      <linearGradient id="convGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                      axisLine={{ stroke: "#E2E8F0" }}
                      tickLine={false}
                    />
                    {/* Left Y-Axis: Spend */}
                    <YAxis
                      yAxisId="spendAxis"
                      orientation="left"
                      domain={[0, 'auto']}
                      tick={{ fontSize: 10, fill: "#2563EB" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val)}
                    />
                    {/* Right Y-Axis: Conversions */}
                    <YAxis
                      yAxisId="convAxis"
                      orientation="right"
                      domain={[0, 'auto']}
                      tick={{ fontSize: 10, fill: "#10B981" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val)}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar
                      yAxisId="spendAxis"
                      dataKey="spend"
                      name="Spend"
                      fill="url(#spendGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={46}
                      minPointSize={10}
                    />
                    <Bar
                      yAxisId="convAxis"
                      dataKey="conversions"
                      name="Conversions"
                      fill="url(#convGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={46}
                      minPointSize={10}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <CustomBarLegend />
              </>
            ) : (
              <div className="empty-chart-state">
                <p>No performance comparison data available.</p>
                <span className="empty-chart-sub">
                  {selectedAccountObj
                    ? `${selectedAccountObj.accountName || selectedAccountObj.accountId} has no spend or conversions recorded for this date range.`
                    : "No spend or conversions recorded for the selected filters."}
                </span>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-card funnel-card">
          <div className="card-header">
            <h3>Marketing Funnel</h3>
            <p className="card-subtitle">Aggregated for selected date range.</p>
          </div>
          <div className="funnel-empty-state">
            <div className="funnel-target-icon">
              <Target size={32} />
            </div>
            <p className="empty-text">
              {loading ? "Loading funnel data..." : "No funnel data for this date range."}
            </p>
          </div>
        </article>
      </section>

      {/* Row 4: Industry Benchmarks Table */}
      <section className="dashboard-benchmarks-section">
        <article className="dashboard-card benchmarks-card">
          <div className="card-header">
            <h3>Industry Benchmarks</h3>
            <p className="card-subtitle">Monthly benchmark funnels compared to aggregated average</p>
          </div>
          <div className="benchmarks-table-wrapper">
            <div className="benchmark-header-row">
              <span className="col-action">Action</span>
              <span className="col-month">Jul 26</span>
              <span className="col-month">
                <span className="tag-cad">CAD</span> Aug 26
              </span>
              <span className="col-month">
                <span className="tag-cad">CAD</span> Sep 26
              </span>
              <span className="col-avg">
                <span className="tag-cad">CAD</span> Avg <span className="tag-cad">CAC</span>
              </span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
};

export default Dashboard;

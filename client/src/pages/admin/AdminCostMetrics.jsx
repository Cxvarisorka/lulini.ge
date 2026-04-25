import { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, Loader2, TrendingDown, TrendingUp, Database, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { locationsService } from '../../services/locations';

// Estimated $ cost per call — only used to give a "this is what you'd be paying"
// reference. Real bills depend on Google contracts; treat as a directional guide.
const COST_PER_CALL = {
  'api:google:autocomplete': 0.00283, // $2.83 per 1k after free tier
  'api:google:details':      0.017,
  'api:google:geocode':      0.005,
  'api:google:matrix':       0.005,
  'api:google:directions':   0.005,
  'api:nominatim':           0,        // free / self-hosted
};

const METRIC_GROUPS = [
  {
    title: 'Google Maps API',
    icon: Zap,
    metrics: [
      { key: 'api:google:autocomplete', label: 'Autocomplete' },
      { key: 'api:google:details',      label: 'Place Details' },
      { key: 'api:google:geocode',      label: 'Geocode' },
      { key: 'api:google:matrix',       label: 'Distance Matrix' },
      { key: 'api:google:directions',   label: 'Directions' },
    ],
  },
  {
    title: 'Nominatim (Free)',
    icon: Database,
    metrics: [
      { key: 'api:nominatim', label: 'Calls' },
    ],
  },
];

const CACHE_GROUPS = [
  {
    title: 'Autocomplete cache',
    hit: 'cache:autocomplete:hit',
    miss: 'cache:autocomplete:miss',
  },
  {
    title: 'Place details cache',
    hit: 'cache:details:hit',
    miss: 'cache:details:miss',
  },
  {
    title: 'Mongo places (warm cache)',
    hit: 'cache:placeMongo:hit',
    miss: 'cache:placeMongo:miss',
  },
];

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatUSD(n) {
  if (!n) return '$0.00';
  if (n < 0.01) return `<$0.01`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

function totalCost(totals) {
  let sum = 0;
  for (const [key, count] of Object.entries(totals || {})) {
    sum += (COST_PER_CALL[key] || 0) * (count || 0);
  }
  return sum;
}

function projectMonthly(totals, days) {
  const dailyAvg = totalCost(totals) / Math.max(days, 1);
  return dailyAvg * 30;
}

export function AdminCostMetrics() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (n = days) => {
    setError(null);
    try {
      const res = await locationsService.getCostMetrics(n);
      setData(res.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load(days);
  }, [days]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(days);
  };

  const totals = data?.totals || {};
  const ratios = data?.ratios || {};
  const dailyBuckets = data?.daily || {};
  const dayKeys = (data?.days || []).slice().reverse(); // chronological for chart

  const estCost = useMemo(() => totalCost(totals), [totals]);
  const projected = useMemo(() => projectMonthly(totals, days), [totals, days]);

  // Find the daily peak so we can scale the bars
  const dailyTotals = useMemo(() => {
    return dayKeys.map(d => {
      const row = dailyBuckets[d] || {};
      let calls = 0;
      for (const k of Object.keys(COST_PER_CALL)) calls += row[k] || 0;
      return { day: d, calls };
    });
  }, [dayKeys, dailyBuckets]);
  const peakCalls = Math.max(1, ...dailyTotals.map(x => x.calls));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maps API Cost</h1>
          <p className="text-muted-foreground mt-1">
            Provider call counts + cache hit rates over the last {days} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value={1}>Last 24h</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated cost
            </CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(estCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              over the last {days} day{days === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected monthly
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(projected)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              extrapolated from window
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Autocomplete hit rate
            </CardTitle>
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ratios.autocompleteHitRate ?? 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(totals['cache:autocomplete:hit'])} hits /{' '}
              {formatNumber(totals['cache:autocomplete:miss'])} misses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Place details hit rate
            </CardTitle>
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ratios.detailsHitRate ?? 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(totals['cache:details:hit'])} hits /{' '}
              {formatNumber(totals['cache:details:miss'])} misses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle>Provider calls per day</CardTitle>
          <CardDescription>
            Sum of all paid + free provider calls. Bars scale to peak day in window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dailyTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {dailyTotals.map(({ day, calls }) => {
                const pct = (calls / peakCalls) * 100;
                return (
                  <div key={day} className="grid grid-cols-[100px_1fr_70px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground tabular-nums">{day}</span>
                    <div className="h-6 bg-muted/50 rounded overflow-hidden relative">
                      <div
                        className="h-full bg-primary/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-right font-medium tabular-nums">
                      {formatNumber(calls)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {METRIC_GROUPS.map(group => {
          const Icon = group.icon;
          return (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5" />
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {group.metrics.map(m => {
                    const count = totals[m.key] || 0;
                    const cost = (COST_PER_CALL[m.key] || 0) * count;
                    return (
                      <div key={m.key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{m.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-medium tabular-nums">{formatNumber(count)}</span>
                          {COST_PER_CALL[m.key] > 0 && (
                            <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                              {formatUSD(cost)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cache breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Cache layers
          </CardTitle>
          <CardDescription>
            Higher hit rate = more requests served free without hitting Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {CACHE_GROUPS.map(g => {
              const hits = totals[g.hit] || 0;
              const misses = totals[g.miss] || 0;
              const total = hits + misses;
              const rate = total > 0 ? (hits / total) * 100 : 0;
              return (
                <div key={g.title}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">{g.title}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatNumber(hits)} / {formatNumber(total)} ({rate.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cost figures are estimates based on Google's published per-call pricing
        and may not match the exact billing on your account.
      </p>
    </div>
  );
}

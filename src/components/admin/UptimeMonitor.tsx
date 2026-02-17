'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, HeartPulse, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';

interface HealthCheck {
  name: string;
  url: string;
  status: 'up' | 'down';
  statusCode: number | null;
  responseTimeMs: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    up: number;
    down: number;
  };
  failed?: { name: string; url: string; error: string }[];
}

export default function UptimeMonitor() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cron/health');
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run health check');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5" />
            Uptime Monitor
          </CardTitle>
          <CardDescription>
            Check if key pages on your site are responding. This calls the /api/cron/health endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runCheck} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Health Check
              </>
            )}
          </Button>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Status overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {result.status === 'healthy' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                Status: {result.status === 'healthy' ? 'All Systems Operational' : 'Degraded'}
              </CardTitle>
              <CardDescription>
                Last checked: {new Date(result.timestamp).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{result.summary.total}</p>
                  <p className="text-xs text-blue-600">Checked</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.summary.up}</p>
                  <p className="text-xs text-green-600">Up</p>
                </div>
                <div className={`${result.summary.down > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-3 text-center`}>
                  <p className={`text-2xl font-bold ${result.summary.down > 0 ? 'text-red-700' : 'text-gray-400'}`}>{result.summary.down}</p>
                  <p className={`text-xs ${result.summary.down > 0 ? 'text-red-600' : 'text-gray-400'}`}>Down</p>
                </div>
              </div>

              {/* Detailed checks */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Page</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">HTTP Code</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Response Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.checks.map((check) => (
                      <tr key={check.url} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{check.name}</p>
                            <p className="text-xs text-muted-foreground">{check.url}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {check.status === 'up' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle2 className="w-3 h-3" /> Up
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="w-3 h-3" /> Down
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {check.statusCode ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {check.responseTimeMs}ms
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error details */}
              {result.failed && result.failed.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 mb-2">Failed Endpoints:</p>
                  <ul className="space-y-1">
                    {result.failed.map((f) => (
                      <li key={f.url} className="text-sm text-red-700">
                        <span className="font-medium">{f.name}</span> ({f.url}): {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cron setup info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Automated Monitoring Setup</CardTitle>
              <CardDescription>
                Add this to your vercel.json to run health checks automatically
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
{`{
  "crons": [
    {
      "path": "/api/cron/health",
      "schedule": "*/15 * * * *"
    }
  ]
}`}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                This checks every 15 minutes. Combine with an alerting service for notifications.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

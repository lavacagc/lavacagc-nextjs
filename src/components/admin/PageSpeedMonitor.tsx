'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Gauge, Smartphone, Monitor } from 'lucide-react';

interface LighthouseScore {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
}

interface PageSpeedResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  scores: LighthouseScore;
  fetchedAt: string;
}

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const DEFAULT_URL = 'https://www.lavacagc.com';

function getScoreColor(score: number): string {
  if (score > 90) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score > 90) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getScoreRingColor(score: number): string {
  if (score > 90) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

function ScoreCircle({ label, score }: { label: string; score: number }) {
  const color = getScoreRingColor(score);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="40"
            stroke="#e5e7eb"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="50" cy="50" r="40"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${getScoreColor(score)}`}>{score}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getScoreBg(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop'): Promise<PageSpeedResult> {
  // Fetch all categories in parallel
  const categories = ['performance', 'accessibility', 'seo', 'best-practices'];
  const apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=${strategy}&${categories.map(c => `category=${c}`).join('&')}`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PageSpeed API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  const cats = data.lighthouseResult?.categories;

  if (!cats) {
    throw new Error('No Lighthouse data returned');
  }

  return {
    url,
    strategy,
    scores: {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export default function PageSpeedMonitor() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PageSpeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunTest = async () => {
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await fetchPageSpeed(url, strategy);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PageSpeed data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            PageSpeed Insights
          </CardTitle>
          <CardDescription>
            Test any page with Google Lighthouse scores. Results reflect real-world performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url-input">Page URL</Label>
              <div className="flex gap-2">
                <Input
                  id="url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.lavacagc.com"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <Button
                  variant={strategy === 'mobile' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStrategy('mobile')}
                >
                  <Smartphone className="w-4 h-4 mr-1" />
                  Mobile
                </Button>
                <Button
                  variant={strategy === 'desktop' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStrategy('desktop')}
                >
                  <Monitor className="w-4 h-4 mr-1" />
                  Desktop
                </Button>
              </div>

              <Button
                onClick={handleRunTest}
                disabled={loading || !url}
                className="ml-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Run Test'
                )}
              </Button>
            </div>

            {loading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Running Lighthouse analysis... This typically takes 15-30 seconds.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Score Circles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Lighthouse Scores — {result.strategy === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}
              </CardTitle>
              <CardDescription>
                {result.url} · Tested {new Date(result.fetchedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center">
                <ScoreCircle label="Performance" score={result.scores.performance} />
                <ScoreCircle label="Accessibility" score={result.scores.accessibility} />
                <ScoreCircle label="SEO" score={result.scores.seo} />
                <ScoreCircle label="Best Practices" score={result.scores.bestPractices} />
              </div>
            </CardContent>
          </Card>

          {/* Score Bars (detailed view) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detailed Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScoreBar label="Performance" score={result.scores.performance} />
              <ScoreBar label="Accessibility" score={result.scores.accessibility} />
              <ScoreBar label="SEO" score={result.scores.seo} />
              <ScoreBar label="Best Practices" score={result.scores.bestPractices} />

              {/* Legend */}
              <div className="flex gap-6 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs text-muted-foreground">Good (90+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-xs text-muted-foreground">Needs Work (50-89)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-xs text-muted-foreground">Poor (&lt;50)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Test Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Test Pages</CardTitle>
              <CardDescription>Click to test key pages on your site</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Homepage', url: 'https://www.lavacagc.com' },
                  { label: 'Services', url: 'https://www.lavacagc.com/services' },
                  { label: 'Contact', url: 'https://www.lavacagc.com/contact' },
                  { label: 'Calculator', url: 'https://www.lavacagc.com/project-calculator' },
                ].map((page) => (
                  <Button
                    key={page.url}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUrl(page.url);
                      // Trigger test after setting URL
                      setTimeout(() => {
                        setUrl(page.url);
                        setLoading(true);
                        setError(null);
                        setResult(null);
                        fetchPageSpeed(page.url, strategy)
                          .then(setResult)
                          .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
                          .finally(() => setLoading(false));
                      }, 0);
                    }}
                    disabled={loading}
                  >
                    {page.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

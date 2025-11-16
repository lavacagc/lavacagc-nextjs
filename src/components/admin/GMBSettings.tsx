import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  useGMBConfig, 
  useGoogleReviews, 
  useGetAuthUrl, 
  useRefreshToken, 
  useGetAccounts,
  useGetLocations,
  useSyncReviews,
  useSaveGMBConfig,
  useSyncLogs
} from '@/hooks/useGMBConfig';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Link2, 
  MapPin, 
  Star, 
  Calendar,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2 as LoaderIcon
} from 'lucide-react';
import { format } from 'date-fns';

export function GMBSettings() {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  const { data: config, isLoading: configLoading } = useGMBConfig();
  const { data: reviews, isLoading: reviewsLoading } = useGoogleReviews();
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const getAuthUrl = useGetAuthUrl();
  const refreshToken = useRefreshToken();
  const getAccounts = useGetAccounts();
  const getLocations = useGetLocations();
  const syncReviews = useSyncReviews();
  const saveConfig = useSaveGMBConfig();

  const hasToken = !!config?.token_expires_at;
  const isConfigured = !!config?.account_id && !!config?.location_id;
  const tokenExpired = config?.token_expires_at && new Date(config.token_expires_at) < new Date();

  const handleConnect = async () => {
    try {
      const result = await getAuthUrl.mutateAsync();
      if (result.authUrl) {
        // Open in popup window
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          result.authUrl,
          'Google Authentication',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        );

        // Listen for authentication success
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'gmb-auth-success') {
            toast.success('Successfully connected to Google My Business!');
            // Force refetch of config data
            setTimeout(() => {
              window.location.reload();
            }, 500);
            window.removeEventListener('message', handleMessage);
          }
        };

        window.addEventListener('message', handleMessage);

        // Fallback: check if popup was blocked
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          toast.error('Popup blocked. Please allow popups for this site.');
        }
      }
    } catch (error) {
      toast.error('Failed to generate authorization URL');
      console.error(error);
    }
  };

  const handleRefreshToken = async () => {
    try {
      await refreshToken.mutateAsync();
      toast.success('Token refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh token');
      console.error(error);
    }
  };

  const handleFetchAccounts = async () => {
    try {
      const result = await getAccounts.mutateAsync();
      if (result.accounts && Array.isArray(result.accounts)) {
        setAccounts(result.accounts);
        toast.success(`Found ${result.accounts.length} account(s)`);
      } else {
        toast.error('No accounts found');
      }
    } catch (error) {
      toast.error('Failed to fetch accounts');
      console.error(error);
    }
  };

  const handleFetchLocations = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account first');
      return;
    }

    try {
      const result = await getLocations.mutateAsync(selectedAccount);
      if (result.locations && Array.isArray(result.locations)) {
        setLocations(result.locations);
        toast.success(`Found ${result.locations.length} location(s)`);
      } else {
        toast.error('No locations found');
      }
    } catch (error) {
      toast.error('Failed to fetch locations');
      console.error(error);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedAccount || !selectedLocation) {
      toast.error('Please select both account and location');
      return;
    }

    const location = locations.find(l => l.name === selectedLocation);
    const businessName = location?.title || 'Unknown';

    try {
      await saveConfig.mutateAsync({
        accountId: selectedAccount,
        locationId: selectedLocation,
        businessName,
      });
      toast.success('Configuration saved successfully');
    } catch (error) {
      toast.error('Failed to save configuration');
      console.error(error);
    }
  };

  const handleSyncReviews = async () => {
    try {
      const result = await syncReviews.mutateAsync();
      if (result.error) {
        toast.error(result.error);
        if (result.details?.error?.message) {
          console.error('GMB API Error:', result.details.error.message);
        }
      } else {
        toast.success(result.message || `Synced ${result.reviewCount} review(s)`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to sync reviews';
      toast.error(errorMessage);
      console.error('Sync error:', error);
    }
  };

  if (configLoading) {
    return <div className="p-8 text-center">Loading configuration...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold">Google My Business Integration</h2>
        <p className="text-muted-foreground">
          Connect your Google My Business account to pull reviews automatically
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>
            Manage your Google My Business API connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {isConfigured ? (
              <Badge variant="default" className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Connected & Configured
              </Badge>
            ) : hasToken ? (
              <Badge variant="secondary" className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Authenticated (Configure Below)
              </Badge>
            ) : (
              <Badge variant="destructive" className="flex items-center gap-1">
                <XCircle className="h-4 w-4" />
                Not Connected
              </Badge>
            )}
            
            {tokenExpired && (
              <Badge variant="destructive">Token Expired</Badge>
            )}
          </div>

          {config && (
            <div className="space-y-2 text-sm">
              {config.business_name && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{config.business_name}</span>
                </div>
              )}
              {config.last_sync && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Last synced: {format(new Date(config.last_sync), 'PPp')}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {!hasToken ? (
              <Button onClick={handleConnect} disabled={getAuthUrl.isPending}>
                <Link2 className="mr-2 h-4 w-4" />
                Connect to Google
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleRefreshToken} 
                  disabled={refreshToken.isPending}
                  variant="outline"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Token
                </Button>
                {isConfigured && (
                  <Button 
                    onClick={handleSyncReviews} 
                    disabled={syncReviews.isPending}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Sync Reviews
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account & Location Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Account Configuration</CardTitle>
          <CardDescription>
            Select your business account and location
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Follow these steps to configure your Google My Business connection:
              <ol className="mt-2 ml-4 list-decimal space-y-1">
                <li>Click "Fetch Accounts" to retrieve your GMB accounts</li>
                <li>Select your account from the list</li>
                <li>Click "Fetch Locations" to get your business locations</li>
                <li>Select your location and click "Save Configuration"</li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Button 
              onClick={handleFetchAccounts} 
              disabled={getAccounts.isPending}
              variant="outline"
            >
              Fetch Accounts
            </Button>

            {accounts.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Account:</label>
                <select 
                  className="w-full rounded-md border p-2"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.accountName || account.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedAccount && (
            <div className="space-y-2">
              <Button 
                onClick={handleFetchLocations} 
                disabled={getLocations.isPending}
                variant="outline"
              >
                Fetch Locations
              </Button>

              {locations.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Location:</label>
                  <select 
                    className="w-full rounded-md border p-2"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                  >
                    <option value="">-- Select Location --</option>
                    {locations.map((location) => {
                      const address = location.storefrontAddress;
                      const addressStr = address 
                        ? `${address.addressLines?.[0] || ''}, ${address.locality || ''}, ${address.administrativeArea || ''} ${address.postalCode || ''}`.trim()
                        : '';
                      const phone = location.phoneNumbers?.primaryPhone;
                      
                      let displayText = location.title || location.name;
                      if (addressStr) displayText += ` - ${addressStr}`;
                      if (phone) displayText += ` - ${phone}`;
                      
                      return (
                        <option key={location.name} value={location.name}>
                          {displayText}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          {selectedAccount && selectedLocation && (
            <div className="pt-2">
              <Alert className="mb-4">
                <AlertDescription>
                  ✓ Account and location selected. Click below to save your configuration.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleSaveConfig} 
                disabled={saveConfig.isPending}
                className="w-full"
              >
                Save Configuration
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reviews Display */}
      <Card>
        <CardHeader>
          <CardTitle>Google Reviews ({reviews?.length || 0})</CardTitle>
          <CardDescription>
            Recent reviews from your Google My Business listing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviewsLoading ? (
            <div className="text-center py-8">Loading reviews...</div>
          ) : reviews && reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{review.reviewer_name || 'Anonymous'}</div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: review.star_rating }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground">{review.comment}</p>
                  )}
                  {review.create_time && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(review.create_time), 'PPP')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No reviews found. Click "Sync Reviews" to fetch them.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Automatic Sync Log
          </CardTitle>
          <CardDescription>
            Reviews sync automatically on the 1st of every month at 2 AM
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center gap-2">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              Loading sync history...
            </div>
          ) : syncLogs && syncLogs.length > 0 ? (
            <div className="space-y-2">
              {syncLogs.slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {log.status === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {log.status === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                    {log.status === 'running' && <LoaderIcon className="h-4 w-4 animate-spin" />}
                    <div>
                      <div className="text-sm font-medium">
                        {format(new Date(log.started_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      {log.error_message && (
                        <div className="text-xs text-muted-foreground">{log.error_message}</div>
                      )}
                    </div>
                  </div>
                  <Badge variant={log.status === 'success' ? 'default' : log.status === 'error' ? 'destructive' : 'secondary'}>
                    {log.triggered_by}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sync history yet. First sync will run on the 1st of next month.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

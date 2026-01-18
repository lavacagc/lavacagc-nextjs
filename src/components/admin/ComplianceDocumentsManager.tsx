'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  FileText,
  Shield,
  Award,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface ComplianceDocument {
  id: string;
  document_type: 'insurance' | 'bond' | 'license';
  display_name: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_ICONS = {
  insurance: Shield,
  bond: Award,
  license: FileText,
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ComplianceDocumentsManager() {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('compliance_documents')
        .select('*')
        .order('document_type');

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching compliance documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load compliance documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = (documentType: string) => {
    setSelectedDocType(documentType);
    // Small delay to ensure state is set before clicking
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDocType) {
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const document = documents.find(d => d.document_type === selectedDocType);
    if (!document) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid File Type',
        description: 'Only PDF files are allowed',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'File size must be less than 10MB',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingType(document.document_type);

    try {
      // Store old file URL for deletion later
      const oldFileUrl = document.file_url;

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${document.document_type}/${timestamp}-${sanitizedName}`;

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from('compliance-documents')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('compliance-documents')
        .getPublicUrl(filePath);

      // Update database record
      const { error: dbError } = await supabase
        .from('compliance_documents')
        .update({
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (dbError) throw dbError;

      // Delete old file if it exists
      if (oldFileUrl) {
        const oldPath = extractPathFromUrl(oldFileUrl);
        if (oldPath) {
          await supabase.storage
            .from('compliance-documents')
            .remove([oldPath]);
        }
      }

      toast({
        title: 'Success',
        description: `${document.display_name} uploaded successfully`,
      });

      // Refresh documents
      await fetchDocuments();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingType(null);
      setSelectedDocType(null);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (document: ComplianceDocument) => {
    if (!document.file_url) return;

    setDeletingType(document.document_type);

    try {
      // Delete file from storage
      const filePath = extractPathFromUrl(document.file_url);
      if (filePath) {
        await supabase.storage
          .from('compliance-documents')
          .remove([filePath]);
      }

      // Update database record
      const { error: dbError } = await supabase
        .from('compliance_documents')
        .update({
          file_url: null,
          file_name: null,
          file_size: null,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (dbError) throw dbError;

      toast({
        title: 'Deleted',
        description: `${document.display_name} removed successfully`,
      });

      await fetchDocuments();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingType(null);
    }
  };

  const handleToggleActive = async (document: ComplianceDocument) => {
    // Can't activate without a file
    if (!document.file_url && !document.is_active) {
      toast({
        title: 'No File Uploaded',
        description: 'Please upload a file before activating',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('compliance_documents')
        .update({
          is_active: !document.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (error) throw error;

      toast({
        title: document.is_active ? 'Deactivated' : 'Activated',
        description: `${document.display_name} is now ${document.is_active ? 'hidden' : 'visible'} on the website`,
      });

      await fetchDocuments();
    } catch (error) {
      console.error('Toggle error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update document status',
        variant: 'destructive',
      });
    }
  };

  const extractPathFromUrl = (url: string): string | null => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const bucketIndex = pathParts.indexOf('compliance-documents');
      if (bucketIndex !== -1) {
        return pathParts.slice(bucketIndex + 1).join('/');
      }
      return null;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance Documents</CardTitle>
        <CardDescription>
          Manage your insurance certificate, compliance bond, and HIC license documents.
          Active documents will be displayed on the About page for customers to download.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Single hidden file input */}
        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {documents.map((doc) => {
            const Icon = DOCUMENT_ICONS[doc.document_type] || FileText;
            const isUploading = uploadingType === doc.document_type;
            const isDeleting = deletingType === doc.document_type;

            return (
              <Card key={doc.id} className="relative">
                <CardContent className="pt-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{doc.display_name}</h3>
                        <p className="text-sm text-muted-foreground">{doc.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="mb-4">
                    {doc.file_url ? (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Uploaded
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                        Not Uploaded
                      </Badge>
                    )}
                  </div>

                  {/* File Info */}
                  {doc.file_url && (
                    <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm">
                      <p className="font-medium truncate" title={doc.file_name || undefined}>
                        {doc.file_name}
                      </p>
                      <div className="flex items-center justify-between text-muted-foreground mt-1">
                        <span>{doc.file_size ? formatFileSize(doc.file_size) : 'Unknown size'}</span>
                        <span>{formatDate(doc.updated_at)}</span>
                      </div>
                    </div>
                  )}

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between mb-4 p-3 border rounded-lg">
                    <Label htmlFor={`active-${doc.id}`} className="text-sm font-medium cursor-pointer">
                      Show on Website
                    </Label>
                    <Switch
                      id={`active-${doc.id}`}
                      checked={doc.is_active}
                      onCheckedChange={() => handleToggleActive(doc)}
                      disabled={!doc.file_url}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleUploadClick(doc.document_type)}
                      disabled={isUploading || isDeleting}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          {doc.file_url ? 'Replace' : 'Upload'}
                        </>
                      )}
                    </Button>

                    {doc.file_url && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                          disabled={isDeleting || isUploading}
                          className="text-destructive hover:text-destructive"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {documents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No compliance documents configured.</p>
            <p className="text-sm mt-2">
              Please run the database setup to create the initial document entries.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

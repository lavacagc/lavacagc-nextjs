'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  category: string;
  featured_image: string;
  created_at: string;
}

interface BlogPostGridProps {
  posts: BlogPost[];
}

export default function BlogPostGrid({ posts }: BlogPostGridProps) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {posts.map((post) => (
        <Card
          key={post.id}
          className="cursor-pointer hover:shadow-card transition-all duration-300 group"
          onClick={() => router.push(`/blog/${post.slug}`)}
        >
          <div className="aspect-video bg-muted rounded-t-lg overflow-hidden relative">
            {post.featured_image ? (
              <Image
                src={post.featured_image}
                alt={post.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent-teal/20 flex items-center justify-center">
                <span className="text-text-muted text-sm">No Image</span>
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs">
                {post.category}
              </Badge>
            </div>
            <h3 className="text-xl font-semibold group-hover:text-primary transition-colors mb-3">
              {post.title}
            </h3>

            <p className="text-muted-foreground mb-4">{post.excerpt}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>By {post.author}</span>
              <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

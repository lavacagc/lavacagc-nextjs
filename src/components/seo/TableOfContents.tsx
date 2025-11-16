'use client'

import React, { useEffect, useState } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';

interface TOCItem {
  id: string;
  title: string;
  level: number;
}

interface TableOfContentsProps {
  items?: TOCItem[];
  autoGenerate?: boolean;
  title?: string;
  className?: string;
}

const TableOfContents: React.FC<TableOfContentsProps> = ({
  items = [],
  autoGenerate = false,
  title = "Table of Contents",
  className = ""
}) => {
  const [tocItems, setTocItems] = useState<TOCItem[]>(items);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (autoGenerate) {
      // Auto-generate TOC from headings on the page
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const generatedItems: TOCItem[] = [];

      headings.forEach((heading) => {
        const level = parseInt(heading.tagName.substring(1));
        const title = heading.textContent || '';
        let id = heading.id;

        if (!id) {
          id = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          heading.id = id;
        }

        generatedItems.push({ id, title, level });
      });

      setTocItems(generatedItems);
    }
  }, [autoGenerate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Track active section for highlighting
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0% -70% 0%' }
    );

    tocItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [tocItems]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    }
  };

  if (tocItems.length === 0) return null;

  return (
    <nav
      className={`bg-background-subtle border border-border rounded-lg p-6 ${className}`}
      aria-label="Table of contents"
    >
      <div className="flex items-center mb-4">
        <BookOpen className="h-5 w-5 text-primary mr-2" />
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>

      <ul className="space-y-2">
        {tocItems.map((item, index) => (
          <li
            key={index}
            style={{ paddingLeft: `${(item.level - 1) * 16}px` }}
          >
            <button
              onClick={() => scrollToSection(item.id)}
              className={`
                w-full text-left p-2 rounded transition-colors text-sm
                hover:bg-muted/50 flex items-center justify-between group
                ${activeId === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
                }
              `}
            >
              <span className="truncate pr-2">{item.title}</span>
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TableOfContents;

import React, { useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  // Position dropdowns with fixed positioning to escape scroll container
  React.useEffect(() => {
    const repositionDropdowns = () => {
      const pickers = document.querySelectorAll('.wysiwyg-editor-container .ql-picker.ql-expanded');
      pickers.forEach((picker) => {
        const label = picker.querySelector('.ql-picker-label');
        const options = picker.querySelector('.ql-picker-options') as HTMLElement;
        if (label && options) {
          const rect = label.getBoundingClientRect();
          options.style.top = `${rect.bottom + 4}px`;
          options.style.left = `${rect.left}px`;
        }
      });
    };

    // Use MutationObserver to detect when dropdowns open
    const observer = new MutationObserver(repositionDropdowns);
    const toolbar = document.querySelector('.wysiwyg-editor-container .ql-toolbar');
    if (toolbar) {
      observer.observe(toolbar, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    // Also reposition on scroll
    const handleScroll = () => repositionDropdowns();
    toolbar?.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      toolbar?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'script': 'sub' }, { 'script': 'super' }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image', 'blockquote', 'code-block'],
      ['clean']
    ],
  }), []);

  const formats = [
    'header', 
    'font', 'size',
    'bold', 'italic', 'underline', 'strike',
    'script',
    'list', 'bullet',
    'link', 'image',
    'blockquote', 'code-block',
    'align', 'color', 'background'
  ];

  return (
    <div className="min-h-[400px] wysiwyg-editor-container relative">
      <div className="overflow-visible">
        <ReactQuill
          theme="snow"
          value={value}
          onChange={onChange}
          modules={modules}
          formats={formats}
          style={{
            height: '350px',
            marginBottom: '50px'
          }}
        />
      </div>
      <style>{`
        /* Ensure parent containers don't clip dropdowns */
        .wysiwyg-editor-container,
        .wysiwyg-editor-container > div,
        .wysiwyg-editor-container .quill {
          overflow: visible !important;
        }

        /* Compact professional toolbar styling */
        .wysiwyg-editor-container .ql-toolbar {
          background: hsl(var(--muted) / 0.3);
          border: 1px solid hsl(var(--border));
          border-bottom: 1px solid hsl(var(--border));
          border-radius: 8px 8px 0 0;
          padding: 8px 12px;
          display: flex;
          flex-wrap: nowrap !important;
          gap: 0;
          overflow-x: auto !important;
          overflow-y: visible !important;
          position: relative;
          z-index: 10;
          max-height: none !important;
          height: auto !important;
        }

        /* Prevent scrollbar from appearing on Y axis */
        .wysiwyg-editor-container .ql-toolbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .wysiwyg-editor-container .ql-toolbar::-webkit-scrollbar {
          height: 6px;
          width: 0 !important;
        }

        .wysiwyg-editor-container .ql-toolbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 3px;
        }

        .wysiwyg-editor-container .ql-container {
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-top: none;
          border-radius: 0 0 8px 8px;
          font-size: 15px;
          font-family: inherit;
          position: relative;
          z-index: 1;
        }

        .wysiwyg-editor-container .ql-editor {
          min-height: 300px;
          padding: 16px;
          line-height: 1.6;
        }

        /* Compact button sizing - 32px × 32px */
        .wysiwyg-editor-container .ql-toolbar button {
          width: 32px !important;
          height: 32px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 4px;
          transition: background-color 0.15s ease;
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
          vertical-align: middle !important;
          line-height: 1 !important;
        }

        .wysiwyg-editor-container .ql-toolbar button:hover {
          background-color: hsl(var(--muted)) !important;
        }

        .wysiwyg-editor-container .ql-toolbar button.ql-active {
          background-color: hsl(var(--primary) / 0.1) !important;
          color: hsl(var(--primary)) !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-picker {
          height: 32px !important;
          border-radius: 6px;
          border: 1px solid hsl(var(--border));
          transition: all 0.15s ease;
          background-color: hsl(var(--background)) !important;
          display: inline-flex !important;
          align-items: center !important;
          vertical-align: middle !important;
          padding-right: 24px !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-picker:hover {
          border-color: hsl(var(--border));
          background-color: hsl(var(--muted) / 0.5) !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-picker.ql-expanded {
          border-color: hsl(var(--primary)) !important;
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2) !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-picker-label {
          padding: 0 8px 0 12px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          font-size: 14px;
          line-height: 1 !important;
          color: hsl(var(--foreground)) !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-picker-label::before {
          line-height: 1 !important;
        }

        /* ChevronDown styling */
        .wysiwyg-editor-container .ql-toolbar .ql-picker-label svg,
        .wysiwyg-editor-container .ql-toolbar .ql-picker-label::after {
          color: hsl(var(--muted-foreground)) !important;
          opacity: 0.7;
        }

        /* Icon sizing - 18px for professional look */
        .wysiwyg-editor-container .ql-toolbar button svg {
          width: 18px !important;
          height: 18px !important;
          display: block !important;
          margin: auto !important;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-stroke {
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }

        .wysiwyg-editor-container .ql-toolbar .ql-fill {
          fill: currentColor;
          stroke: none;
        }

        /* Ensure picker icons are also 18px and centered */
        .wysiwyg-editor-container .ql-toolbar .ql-picker-label svg {
          width: 18px !important;
          height: 18px !important;
          display: block !important;
          margin: auto !important;
        }

        /* Fix icon positioning */
        .wysiwyg-editor-container .ql-toolbar button > * {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Ensure color picker and other special buttons are centered */
        .wysiwyg-editor-container .ql-toolbar .ql-color-picker .ql-picker-label,
        .wysiwyg-editor-container .ql-toolbar .ql-icon-picker .ql-picker-label {
          width: 32px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* Visual separators between tool groups */
        .wysiwyg-editor-container .ql-toolbar .ql-formats {
          display: flex !important;
          align-items: center !important;
          gap: 2px !important;
          margin: 0 !important;
          padding: 0 !important;
          flex-shrink: 0;
          position: relative;
          height: auto !important;
          max-height: none !important;
        }

        /* Add vertical separator AFTER each group */
        .wysiwyg-editor-container .ql-toolbar .ql-formats::after {
          content: '';
          width: 1px;
          height: 24px;
          background: hsl(var(--border));
          margin: 0 8px;
          flex-shrink: 0;
        }

        /* Remove separator after last group */
        .wysiwyg-editor-container .ql-toolbar .ql-formats:last-child::after {
          display: none;
        }

        /* Picker dropdown styling - Use fixed positioning to escape scroll container */
        .wysiwyg-editor-container .ql-picker-options {
          background: hsl(var(--background)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: 6px !important;
          padding: 4px !important;
          box-shadow: 0 4px 12px -2px rgb(0 0 0 / 0.15), 0 10px 25px -5px rgb(0 0 0 / 0.1) !important;
          z-index: 9999 !important;
          margin-top: 4px !important;
          min-width: 120px !important;
          position: fixed !important;
        }

        .wysiwyg-editor-container .ql-picker-item {
          padding: 8px 12px !important;
          border-radius: 4px !important;
          transition: all 0.15s ease !important;
          color: hsl(var(--foreground)) !important;
          cursor: pointer !important;
        }

        .wysiwyg-editor-container .ql-picker-item:hover {
          background-color: hsl(var(--muted)) !important;
        }

        .wysiwyg-editor-container .ql-picker-item.ql-selected {
          background-color: hsl(var(--primary) / 0.1) !important;
          color: hsl(var(--primary)) !important;
        }

        /* Add dividers between option groups */
        .wysiwyg-editor-container .ql-picker-options .ql-picker-item:not(:last-child) {
          margin-bottom: 1px;
        }

        /* Ensure picker is above other content */
        .wysiwyg-editor-container .ql-picker.ql-expanded .ql-picker-label {
          z-index: 9998 !important;
        }

        /* Color picker specific styling */
        .wysiwyg-editor-container .ql-color-picker .ql-picker-options,
        .wysiwyg-editor-container .ql-background .ql-picker-options {
          width: 200px !important;
          padding: 8px !important;
        }

        /* Add label to color pickers */
        .wysiwyg-editor-container .ql-color-picker .ql-picker-options::before {
          content: 'Text Color';
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: hsl(var(--muted-foreground));
          padding: 0 4px 8px 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .wysiwyg-editor-container .ql-background .ql-picker-options::before {
          content: 'Highlight';
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: hsl(var(--muted-foreground));
          padding: 0 4px 8px 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .wysiwyg-editor-container .ql-color-picker .ql-picker-item,
        .wysiwyg-editor-container .ql-background .ql-picker-item {
          width: 28px !important;
          height: 28px !important;
          padding: 0 !important;
          border-radius: 4px !important;
          border: 2px solid hsl(var(--border)) !important;
          display: inline-block !important;
          margin: 2px !important;
          transition: all 0.15s ease !important;
        }

        .wysiwyg-editor-container .ql-color-picker .ql-picker-item:hover,
        .wysiwyg-editor-container .ql-background .ql-picker-item:hover {
          border-color: hsl(var(--primary)) !important;
          transform: scale(1.15) !important;
        }

        .wysiwyg-editor-container .ql-color-picker .ql-picker-item.ql-selected,
        .wysiwyg-editor-container .ql-background .ql-picker-item.ql-selected {
          border-color: hsl(var(--primary)) !important;
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2) !important;
        }

        /* Header dropdown specific styling */
        .wysiwyg-editor-container .ql-header.ql-picker .ql-picker-options {
          min-width: 140px !important;
        }

        .wysiwyg-editor-container .ql-header.ql-picker .ql-picker-item::before {
          content: 'Normal' !important;
          font-size: 14px !important;
        }

        .wysiwyg-editor-container .ql-header.ql-picker .ql-picker-item[data-value="1"]::before {
          content: 'Heading 1' !important;
          font-size: 18px !important;
          font-weight: 600 !important;
        }

        .wysiwyg-editor-container .ql-header.ql-picker .ql-picker-item[data-value="2"]::before {
          content: 'Heading 2' !important;
          font-size: 16px !important;
          font-weight: 600 !important;
        }

        .wysiwyg-editor-container .ql-header.ql-picker .ql-picker-item[data-value="3"]::before {
          content: 'Heading 3' !important;
          font-size: 14px !important;
          font-weight: 600 !important;
        }

        /* Ensure picker container for positioning reference */
        .wysiwyg-editor-container .ql-picker {
          position: static !important;
          z-index: 100;
        }

        /* Position dropdowns using JavaScript via fixed positioning */
        .wysiwyg-editor-container .ql-picker.ql-expanded .ql-picker-options {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Focus states */
        .wysiwyg-editor-container .ql-editor:focus {
          outline: none;
        }

        .wysiwyg-editor-container .ql-container.ql-snow {
          border-color: hsl(var(--border));
        }

        .wysiwyg-editor-container .ql-editor.ql-blank::before {
          color: hsl(var(--muted-foreground));
          font-style: normal;
        }

        /* Ensure proper spacing and alignment */
        .wysiwyg-editor-container .ql-toolbar {
          line-height: 1;
        }

        /* Color picker button */
        .wysiwyg-editor-container .ql-toolbar .ql-color-picker .ql-picker-label {
          width: 32px !important;
        }
      `}</style>
    </div>
  );
}
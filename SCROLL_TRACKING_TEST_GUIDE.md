# Scroll Tracking Implementation - Testing Guide

## 🎉 Implementation Complete!

Your website now has comprehensive scroll and engagement tracking implemented. This guide will help you test and verify everything is working correctly.

---

## 🚀 What's Been Implemented

### 1. **Core Infrastructure**
- ✅ Enhanced `analyticsManager.ts` with 5 new tracking functions
- ✅ Created `useScrollTracking` hook for vertical scroll tracking
- ✅ Created `useHorizontalScrollTracking` hook for horizontal galleries
- ✅ Created `scrollTracking.ts` utilities for calculations and deduplication
- ✅ Updated TypeScript definitions with new event types

### 2. **Tracking Events Added**

#### **Scroll Tracking Events:**
- `scroll_depth` - Fires at 25%, 50%, 75%, 100% scroll milestones
- `section_view` - Tracks section visibility and time spent
- `element_view` - Tracks individual elements (portfolio items, cards)
- `horizontal_scroll` - Tracks horizontal gallery scroll depth

#### **Calculator Tracking Events:**
- `calculator_step` - Tracks each step with enter/exit/complete actions
- Includes time spent on each step
- Tracks dropoff points (when users exit mid-calculation)

#### **Engagement Events:**
- `portfolio_filter` - When users filter portfolio projects
- `project_gallery_filter` - When users filter on home page gallery
- `portfolio_lightbox_open` - When users open project images

### 3. **Pages & Components Tracked**

#### **Portfolio Page (`/portfolio`)**
- ✅ Portfolio section scroll depth (25%, 50%, 75%, 100%)
- ✅ Time spent browsing portfolio
- ✅ Individual project card views
- ✅ Horizontal scroll through project cards
- ✅ Filter interactions
- ✅ Lightbox opens

#### **Home Page (`/`)**
- ✅ Quick Estimate Form section
- ✅ Testimonials section
- ✅ Services horizontal scroll section
- ✅ Project Gallery with horizontal scroll
- ✅ Service Areas section
- ✅ Why Choose Us section
- ✅ Featured Services grid

#### **Cost Calculator (`/project-calculator`)**
- ✅ Step 1: Project Type Selection
- ✅ Step 2: Dimensions (or Overview for home additions)
- ✅ Step 3: Quality Level (or PDF Upload)
- ✅ Step 4: Material Options (or Contact Info)
- ✅ Step 5: Additional Features
- ✅ Step 6: Contact Information
- ✅ Completion tracking
- ✅ Dropoff tracking (when users leave mid-flow)

---

## 🧪 How to Test in Localhost

### **Step 1: Enable GA4 Debug Mode**

1. **Install Google Analytics Debugger Chrome Extension:**
   - Go to: https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna
   - Click "Add to Chrome"

2. **Enable the Debugger:**
   - Click the extension icon in Chrome
   - Make sure it's turned ON (blue icon)

3. **Open Chrome DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to the **Console** tab

### **Step 2: Visit Localhost**

Your dev server is running at: **http://localhost:3000**

### **Step 3: Test Each Section**

#### **Test 1: Home Page Sections**

1. **Load the home page**: http://localhost:3000
2. **Scroll slowly** through each section
3. **Watch the Console** for GA events:
   ```
   section_view - Quick Estimate Form
   scroll_depth - Quick Estimate Form - 25%
   scroll_depth - Quick Estimate Form - 50%
   section_view - Testimonials Section
   ...
   ```

4. **Scroll the Services horizontal gallery** (drag or swipe)
   - Should fire `horizontal_scroll` events at 25%, 50%, 75%, 100%

5. **Scroll the Project Gallery**
   - Should fire `section_view` and `scroll_depth` events
   - Individual project cards should fire `element_view` events

6. **Click a filter button** on Project Gallery
   - Should fire `project_gallery_filter` event with the filter type

#### **Test 2: Portfolio Page**

1. **Visit**: http://localhost:3000/portfolio
2. **Scroll through the portfolio**
   - Watch for `scroll_depth` events at 25%, 50%, 75%, 100%
   - Watch for `section_view` events with time_spent_seconds

3. **Scroll the horizontal project gallery**
   - Should fire `horizontal_scroll` events

4. **Click a filter** (e.g., "Kitchen Remodeling")
   - Should fire `portfolio_filter` event

5. **Click a project image** to open lightbox
   - Should fire `portfolio_lightbox_open` event

6. **Hover over project cards** as you scroll
   - Should fire `element_view` events for each card

#### **Test 3: Cost Calculator**

1. **Visit**: http://localhost:3000/project-calculator
2. **Start the calculator**
3. **Watch Console for each step:**
   ```
   calculator_step - Step 1: Project Type Selection - enter
   calculator_step - Step 1: Project Type Selection - exit - time_spent: 5s
   calculator_step - Step 2: Dimensions - enter
   calculator_step - Step 2: Dimensions - exit - time_spent: 8s
   ...
   ```

4. **Complete the entire flow**
   - Final step should show `action: complete`

5. **Test dropoff:** Start calculator, then close the tab
   - Should track `exit` events for the step you were on

---

## 📊 What to Look For in Console

### **Successful Event Format:**
```javascript
// Section View Event
{
  event: 'section_view',
  section_name: 'Portfolio Grid',
  section_id: 'portfolio-grid',
  time_spent_seconds: 12,
  event_category: 'engagement'
}

// Scroll Depth Event
{
  event: 'scroll_depth',
  section_name: 'Portfolio Grid',
  section_id: 'portfolio-grid',
  depth_percentage: 50,
  event_category: 'engagement'
}

// Calculator Step Event
{
  event: 'calculator_step',
  step_number: 2,
  step_name: 'Dimensions',
  action: 'exit',
  time_spent_seconds: 8,
  event_category: 'calculator'
}
```

---

## 🎯 GA4 DebugView Testing (Optional - Requires GA4 Setup)

If you have GA4 configured, you can view events in real-time:

1. **Go to GA4 Dashboard**: https://analytics.google.com
2. **Navigate to**: Admin → DebugView
3. **Filter to your device** (it will show "debugger-xxxxx")
4. **Perform actions** on localhost
5. **Watch events appear** in real-time in DebugView

### **Key Events to Verify:**
- ✅ `section_view` with `section_name` and `time_spent_seconds`
- ✅ `scroll_depth` with `depth_percentage` (25, 50, 75, 100)
- ✅ `calculator_step` with `action` (enter, exit, complete)
- ✅ `element_view` with `element_name`
- ✅ `horizontal_scroll` with `scroll_percentage`

---

## 🔍 Troubleshooting

### **No Events Firing?**

1. **Check Cookie Consent:**
   - Make sure you've accepted cookies on localhost
   - Events won't fire if analytics consent is denied

2. **Check GA Configuration:**
   - Go to: http://localhost:3000/admin
   - Navigate to Analytics Settings
   - Ensure "Tracking Enabled" is ON
   - Verify GA4 Measurement ID is configured

3. **Check Console for Errors:**
   - Open DevTools → Console
   - Look for any red errors related to analytics

### **Events Firing Multiple Times?**

This is normal! The deduplication logic uses `sessionStorage` to prevent duplicate events:
- Same event won't fire twice in the same session
- Session resets when you close the tab

### **Scroll Events Not Firing?**

1. **Ensure you're scrolling slowly** - Fast scrolling might skip thresholds
2. **Check section visibility** - Sections must be at least 10% visible
3. **Try refreshing** the page to reset session tracking

---

## 📈 Next Steps: Analyzing Data in GA4

Once you deploy to production, you can create custom reports:

### **Recommended Custom Reports:**

1. **Section Engagement Report:**
   - Event: `section_view`
   - Dimensions: `section_name`, `time_spent_seconds`
   - Metric: Average time spent per section

2. **Scroll Depth Funnel:**
   - Event: `scroll_depth`
   - Dimensions: `section_name`, `depth_percentage`
   - Metric: % of users reaching each depth

3. **Calculator Dropoff Analysis:**
   - Event: `calculator_step`
   - Dimensions: `step_name`, `action`
   - Metric: Dropoff rate per step

4. **Portfolio Engagement:**
   - Events: `portfolio_filter`, `element_view`, `portfolio_lightbox_open`
   - Dimensions: `filter_type`, `element_name`, `project_title`
   - Metric: Total interactions

---

## 🚀 Deploying to Production

When you're ready to deploy:

1. **Test on localhost first** (you're doing this now!)
2. **Verify all events are firing correctly**
3. **Deploy to production** (e.g., Vercel, Netlify)
4. **Test on production** with GA4 DebugView
5. **Wait 24-48 hours** for data to populate in GA4 reports

---

## 📋 Summary of Implementation

### **Files Created:**
- `src/utils/scrollTracking.ts` - Utility functions
- `src/hooks/useScrollTracking.tsx` - Scroll tracking hook
- `src/hooks/useHorizontalScrollTracking.tsx` - Horizontal scroll hook
- `src/components/TrackedSection.tsx` - Wrapper component

### **Files Modified:**
- `src/services/analyticsManager.ts` - Added 5 tracking functions
- `src/types/analytics.d.ts` - Added event type definitions
- `src/components/PortfolioContent.tsx` - Added tracking
- `src/components/ProjectGallery.tsx` - Added tracking
- `src/components/UnifiedCalculator.tsx` - Added step tracking
- `src/app/page.tsx` - Wrapped sections with TrackedSection

### **Tracking Capabilities:**
✅ Time spent in sections (min 3 seconds threshold)
✅ Scroll depth (25%, 50%, 75%, 100%)
✅ Section visibility tracking
✅ Individual element views
✅ Horizontal scroll tracking
✅ Calculator step progression
✅ Calculator dropoff detection
✅ Filter interactions
✅ Lightbox interactions

---

## 🎉 You're All Set!

Your scroll tracking is now live on localhost. Test it out and when you're satisfied, deploy to production!

**Questions or Issues?**
- Check the console for errors
- Verify GA configuration in `/admin`
- Ensure cookies are accepted
- Try clearing sessionStorage and refreshing

**Ready to deploy?** Just push to your production branch!

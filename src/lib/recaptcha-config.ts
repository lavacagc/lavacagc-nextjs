/*
To set up reCAPTCHA v3 for production:

1. Go to https://www.google.com/recaptcha/admin/create
2. Choose reCAPTCHA v3
3. Add your domain(s)
4. Get your Site Key and Secret Key
5. Add both keys to your Supabase secrets:
   - RECAPTCHA_SITE_KEY (for frontend)
   - RECAPTCHA_SECRET_KEY (for backend verification)

reCAPTCHA v3 benefits:
- Invisible to users (no checkbox)
- Returns a score from 0.0 to 1.0 (1.0 = very likely human)
- Better user experience
- More secure with backend verification
*/

export const RECAPTCHA_SITE_KEY = "6LfEmNkrAAAAAKShO1lywaz84U-SBW7ADsJM9OFu";
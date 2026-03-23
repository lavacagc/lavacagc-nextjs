import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      referrerName,
      referrerEmail,
      referrerPhone,
      friendName,
      friendEmail,
      friendPhone,
      projectType,
      message,
    } = body;

    // Basic validation
    if (!referrerName || !referrerEmail || !referrerPhone || !friendName || !friendEmail || !friendPhone || !projectType) {
      return NextResponse.json(
        { error: 'All required fields must be filled out.' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(referrerEmail) || !emailRegex.test(friendEmail)) {
      return NextResponse.json(
        { error: 'Please provide valid email addresses.' },
        { status: 400 }
      );
    }

    // Phone validation
    const phoneRegex = /^[\+]?[0-9\(\)\s\-\.]{7,20}$/;
    if (!phoneRegex.test(referrerPhone) || !phoneRegex.test(friendPhone)) {
      return NextResponse.json(
        { error: 'Please provide valid phone numbers.' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)('referrals')
      .insert({
        referrer_name: referrerName.trim(),
        referrer_email: referrerEmail.trim().toLowerCase(),
        referrer_phone: referrerPhone.trim(),
        friend_name: friendName.trim(),
        friend_email: friendEmail.trim().toLowerCase(),
        friend_phone: friendPhone.trim(),
        project_type: projectType.trim(),
        message: message?.trim() || null,
        status: 'pending',
      });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to submit referral. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Referral submitted successfully!' },
      { status: 201 }
    );
  } catch (err) {
    console.error('Referral submission error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

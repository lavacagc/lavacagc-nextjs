import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/telegram-lead
 * Sends instant Telegram notification when a new lead is captured.
 * 
 * Setup required:
 * 1. Set TELEGRAM_BOT_TOKEN in env vars (get from @BotFather)
 * 2. Set TELEGRAM_CHAT_ID in env vars (your chat ID or channel ID)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      email, 
      phone, 
      projectType, 
      location,
      score, 
      tier,
      source,
      estimate 
    } = body as {
      name?: string;
      email?: string;
      phone?: string;
      projectType?: string;
      location?: string;
      score?: number;
      tier?: 'hot' | 'warm' | 'cold';
      source?: string;
      estimate?: number;
    };

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured — skipping Telegram notification');
      return NextResponse.json({
        status: 'skipped',
        reason: 'not_configured',
        message: 'Telegram credentials not configured',
      });
    }

    // Determine emoji based on tier
    let tierEmoji = '🔵'; // cold
    if (tier === 'hot') {
      tierEmoji = '🔥';
    } else if (tier === 'warm') {
      tierEmoji = '🟡';
    }

    // Build message
    const lines = [
      `${tierEmoji} <b>New ${tier?.toUpperCase() || 'LEAD'} Lead!</b>`,
      '',
      `👤 <b>Name:</b> ${name || 'Not provided'}`,
    ];

    if (phone) {
      lines.push(`📱 <b>Phone:</b> <code>${phone}</code>`);
    }

    if (email) {
      lines.push(`📧 <b>Email:</b> ${email}`);
    }

    if (projectType) {
      lines.push(`🏠 <b>Project:</b> ${projectType}`);
    }

    if (location) {
      lines.push(`📍 <b>Location:</b> ${location}`);
    }

    if (estimate) {
      lines.push(`💰 <b>Estimate:</b> $${Math.round(estimate).toLocaleString()}`);
    }

    if (score !== undefined) {
      lines.push(`⭐ <b>Score:</b> ${score}/100`);
    }

    if (source) {
      lines.push(`📊 <b>Source:</b> ${source}`);
    }

    const message = lines.join('\n');

    // Send to Telegram via Bot API
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Telegram API error:', result);
      return NextResponse.json(
        { 
          status: 'failed', 
          error: result.description || 'Unknown Telegram API error' 
        },
        { status: 500 }
      );
    }

    console.log(`✅ Telegram notification sent for lead: ${name || 'Unknown'} (${tier || 'no tier'})`);
    return NextResponse.json({ 
      status: 'sent', 
      messageId: result.result?.message_id 
    });

  } catch (error) {
    console.error('Telegram notification endpoint error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

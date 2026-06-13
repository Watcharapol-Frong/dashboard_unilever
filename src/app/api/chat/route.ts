import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { query, conversationId } = await req.json()

    const apiKey = process.env.DIFY_API_KEY
    const apiUrl = process.env.NEXT_PUBLIC_DIFY_API_URL || 'https://api.dify.ai/v1'

    if (!apiKey) {
      console.error('DIFY_API_KEY is not defined in environment variables.')
      return new Response(
        JSON.stringify({ error: 'Dify API Key is not configured on the server.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const response = await fetch(`${apiUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'streaming',
        user: 'preview-user',
        conversation_id: conversationId || '',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Dify API returned an error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: `Dify API Error: ${errorText || response.statusText}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Error in /api/chat route:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

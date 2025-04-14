// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

const VECTOR_STORE_ID = Deno.env.get('VECTOR_STORE_ID');

serve(async (req) => {
  try {
    const { fileName, base64Content, userId } = await req.json();

    const buffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    const file = new File([buffer], fileName, { type: 'application/pdf' });

    const uploaded = await openai.files.create({
      file,
      purpose: 'assistants'
    });

    const added = await openai.beta.vectorStores.files.create(VECTOR_STORE_ID, {
      file_id: uploaded.id
    });

    let status;
    do {
      const result = await openai.beta.vectorStores.files.retrieve(VECTOR_STORE_ID, added.id);
      status = result.status;
      if (status !== 'completed') await new Promise(r => setTimeout(r, 1000));
    } while (status !== 'completed');

    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/vector_files`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_ANON_KEY'),
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        file_id: uploaded.id,
        file_name: fileName,
        vector_store_id: VECTOR_STORE_ID
      })
    });

    if (!response.ok) {
      throw new Error('Failed to insert in Supabase');
    }

    return new Response(JSON.stringify({ message: '✅ Upload complet!' }), {
      status: 200
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500
    });
  }
});

import { $, component$, useStore } from "@builder.io/qwik";

/** @type {import('@builder.io/qwik-city').RequestHandler} */
export const onPost = async (requestEvent) => {
  const stream = new ReadableStream({
    async start(controller) {
      const formData = await requestEvent.parseBody()
      // Do work before streaming
      const OPENAI_API_KEY = requestEvent.env.get('OPENAI_API_KEY')

      const prompt = formData.prompt
      const body = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        stream: true
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body)
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let isStillStreaming = true

      while (isStillStreaming) {
        const { value, done } = await reader.read()
        const chunkValue = decoder.decode(value)

        /**
         * Captures any string after the text `data: `
         * @see https://regex101.com/r/R4QgmZ/1
         */
        const regex = /data:\s*(.*)/g
        let match = regex.exec(chunkValue)

        while (match !== null) {
          const payload = match[1]

          // Close stream
          if (payload === '[DONE]') {
            controller.close()
          }

          const json = JSON.parse(payload)
          const text = json.choices[0].delta.content || ''

          // Send chunk of data
          controller.enqueue(text)

          match = regex.exec(chunkValue)
        }

        isStillStreaming = !done
      }
    }
  })

  requestEvent.send(new Response(stream))
}

/**
 * @param {HTMLFormElement} form 
 */
function jsFormSubmit(form) {
  const url = new URL(form.action)
  const formData = new FormData(form)
  const searchParameters = new URLSearchParams(formData)

  /** @type {Parameters<typeof fetch>[1]} */
  const fetchOptions = {
    method: form.method
  }

  if (form.method.toLowerCase() === 'post') {
    fetchOptions.body = form.enctype === 'multipart/form-data' ? formData : searchParameters
  } else {
    url.search = searchParameters
  }

  return fetch(url, fetchOptions)
}

export default component$(() => {
  const state = useStore({
    isLoading: false,
    text: ''
  })

  const handleSubmit = $(async (event) => {
    state.isLoading = true

    /** @type {HTMLFormElement} */
    const form = event.target

    const response = await jsFormSubmit(form)

    if (!response.body) {
      state.isLoading = false
      return
    }

    // Parse streaming body
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let isStillStreaming = true

    while (isStillStreaming) {
      const { value, done } = await reader.read()
      const chunkValue = decoder.decode(value)

      state.text += chunkValue

      isStillStreaming = !done
    }

    state.isLoading = false
  })

  return (
    <main class="max-w-4xl mx-auto p-4">
      <h1 class="text-4xl">Hi 👋</h1>

      <form
        method="post"
        class="grid gap-4"
        preventdefault:submit
        onSubmit$={handleSubmit}
      >
        <div>
          <label for="prompt">Prompt</label>
          <textarea name="prompt" id="prompt">
            Tell me a joke
          </textarea>
        </div>

        <div>
          <button type="submit" aria-disabled={state.isLoading}>
            {state.isLoading ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>

      {state.text && (
        <article class="mt-4 border border-2 rounded-lg p-4 bg-[canvas]">
          <p>{state.text}</p>
        </article>
      )}
    </main>
  );
});

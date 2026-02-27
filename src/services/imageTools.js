// ── Image generation tool declaration for Gemini ────────────────────────────

export const IMAGE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate a new image based on a text prompt and an anchor/reference image the user has attached. ' +
      'Use when the user asks to generate, create, or transform an image (e.g. "make it look like X", "generate an image based on this"). ' +
      'Requires the user to have attached an image with their message. The anchor image is the reference; the prompt describes the desired transformation or style.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text prompt describing the desired image or transformation (e.g. "make it look like a watercolor painting", "transform into a cartoon style").',
        },
      },
      required: ['prompt'],
    },
  },
];

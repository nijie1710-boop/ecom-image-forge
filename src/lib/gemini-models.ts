export const IMAGE_MODEL_LABELS = {
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-3.1-flash-image-preview": "Nano Banana 2",
  "nano-banana-pro-preview": "Nano Banana Pro",
  "gemini-3-pro-image-preview": "Nano Banana Pro",
} as const;

export type GenerationModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "nano-banana-pro-preview"
  | "gemini-3-pro-image-preview";

export const IMAGE_MODEL_OPTIONS: Array<{ value: GenerationModel; label: string }> = [
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana" },
];

export const TRANSLATION_IMAGE_MODEL_OPTIONS: Array<{ value: GenerationModel; label: string }> = [
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana" },
];

export type ModelMappingRow = {
  displayName: string;
  internalValue: GenerationModel;
  requestedModel: "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview";
};

export const IMAGE_MODEL_MAPPING_TABLE: ModelMappingRow[] = [
  {
    displayName: "Nano Banana",
    internalValue: "gemini-2.5-flash-image",
    requestedModel: "gemini-2.5-flash-image",
  },
  {
    displayName: "Nano Banana 2",
    internalValue: "gemini-3.1-flash-image-preview",
    requestedModel: "gemini-3.1-flash-image-preview",
  },
  {
    displayName: "Nano Banana Pro",
    internalValue: "nano-banana-pro-preview",
    requestedModel: "gemini-3-pro-image-preview",
  },
];

export function getModelDisplayName(model: string | undefined) {
  return IMAGE_MODEL_LABELS[model as GenerationModel] || String(model || "");
}

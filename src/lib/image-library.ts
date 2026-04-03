export const CURATED_IMAGE_LIBRARY_KEY = "curated_image_library";

export type CuratedImageRecord = {
  id: string;
  image_url: string;
  prompt?: string;
  style?: string;
  scene?: string;
  aspect_ratio?: string;
  image_type?: string;
  created_at: string;
  group_id?: string;
  task_kind?: "image" | "detail" | "copy";
  favorite?: boolean;
  is_best?: boolean;
  source: "curated";
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadCuratedImageLibrary(): CuratedImageRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(CURATED_IMAGE_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCuratedImageLibrary(records: CuratedImageRecord[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(CURATED_IMAGE_LIBRARY_KEY, JSON.stringify(records.slice(0, 150)));
}

export function findCuratedImage(imageUrl: string) {
  return loadCuratedImageLibrary().find((item) => item.image_url === imageUrl) || null;
}

export function upsertCuratedImage(
  record: Omit<CuratedImageRecord, "id" | "created_at" | "source"> &
    Partial<Pick<CuratedImageRecord, "id" | "created_at" | "source">>,
) {
  const records = loadCuratedImageLibrary();
  const existingIndex = records.findIndex((item) => item.image_url === record.image_url);
  const nextRecord: CuratedImageRecord = {
    id: record.id || crypto.randomUUID(),
    created_at: record.created_at || new Date().toISOString(),
    source: "curated",
    favorite: false,
    is_best: false,
    ...record,
  };

  if (existingIndex >= 0) {
    records[existingIndex] = {
      ...records[existingIndex],
      ...nextRecord,
      id: records[existingIndex].id,
      created_at: records[existingIndex].created_at,
      source: "curated",
    };
  } else {
    records.unshift(nextRecord);
  }

  saveCuratedImageLibrary(records);
  return existingIndex >= 0 ? records[existingIndex] : nextRecord;
}

export function toggleCuratedFavorite(
  imageUrl: string,
  seed?: Omit<CuratedImageRecord, "id" | "created_at" | "source" | "favorite" | "is_best">,
) {
  const existing = findCuratedImage(imageUrl);
  return upsertCuratedImage({
    ...(seed || {}),
    image_url: imageUrl,
    favorite: !existing?.favorite,
    is_best: existing?.is_best || false,
  });
}

export function markCuratedBest(
  imageUrl: string,
  groupId?: string,
  seed?: Omit<CuratedImageRecord, "id" | "created_at" | "source" | "favorite" | "is_best">,
) {
  const records = loadCuratedImageLibrary();
  const targetGroup = groupId || findCuratedImage(imageUrl)?.group_id;
  const next = records.map((item) =>
    targetGroup && item.group_id === targetGroup ? { ...item, is_best: item.image_url === imageUrl } : item,
  );
  saveCuratedImageLibrary(next);
  return upsertCuratedImage({
    ...(seed || {}),
    image_url: imageUrl,
    group_id: targetGroup,
    is_best: true,
    favorite: findCuratedImage(imageUrl)?.favorite || false,
  });
}

export function removeCuratedImage(id: string) {
  const records = loadCuratedImageLibrary().filter((item) => item.id !== id);
  saveCuratedImageLibrary(records);
}

import { createSettingsStore, createSettingsDraft, editSettingsDraft, syncSettingsDraft, type SettingsDraft } from "@yoophi/settings-core";

export type MovieFileViewMode = "thumbnail" | "grid" | "compact";

export type MoviePreferences = {
  directoryPath: string | null;
  includePatternText: string;
  viewMode: MovieFileViewMode;
};

export const DEFAULT_INCLUDE_PATTERN =
  "**/*.{mp4|m4v|mkv|avi|mov|wmv|webm|mpg|mpeg|m2ts|flv|3gp|ogv}";

export const DEFAULT_MOVIE_PREFERENCES: MoviePreferences = {
  directoryPath: null,
  includePatternText: DEFAULT_INCLUDE_PATTERN,
  viewMode: "thumbnail",
};

export type PatternDraft = {
  text: string;
  appliedText: string;
  dirty: boolean;
};

const formatPattern = (value: string) => value;
const sharedDraft = (draft: PatternDraft): SettingsDraft<string> => ({ text: draft.text, confirmed: draft.appliedText, dirty: draft.dirty });
const appDraft = (draft: SettingsDraft<string>): PatternDraft => ({ text: draft.text, appliedText: draft.confirmed, dirty: draft.dirty });

export function confirmedPatternDraft(appliedText: string): PatternDraft {
  return appDraft(createSettingsDraft(appliedText, formatPattern));
}

export function editPatternDraft(current: PatternDraft, text: string): PatternDraft {
  return appDraft(editSettingsDraft(sharedDraft(current), text, formatPattern));
}

export function syncPatternDraft(current: PatternDraft, appliedText: string): PatternDraft {
  if (current.appliedText === appliedText) return current;
  return appDraft(syncSettingsDraft(sharedDraft(current), appliedText, formatPattern));
}

export function parseMoviePreferences(value: unknown): MoviePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("영화 탐색기 설정 형식이 올바르지 않습니다.");
  }

  const fields = value as Record<string, unknown>;
  const expected = ["directoryPath", "includePatternText", "viewMode"];
  if (Object.keys(fields).length !== expected.length || expected.some((key) => !(key in fields))) {
    throw new Error("영화 탐색기 설정 항목이 올바르지 않습니다.");
  }
  if (
    (fields.directoryPath !== null &&
      (typeof fields.directoryPath !== "string" || fields.directoryPath.trim() === "")) ||
    typeof fields.includePatternText !== "string" ||
    (fields.viewMode !== "thumbnail" &&
      fields.viewMode !== "grid" &&
      fields.viewMode !== "compact")
  ) {
    throw new Error("영화 탐색기 설정 값이 올바르지 않습니다.");
  }

  return {
    directoryPath: fields.directoryPath,
    includePatternText: fields.includePatternText,
    viewMode: fields.viewMode,
  };
}

export const moviePreferences = createSettingsStore({
  key: "movie-explorer.preferences",
  version: 1,
  defaults: DEFAULT_MOVIE_PREFERENCES,
  parse: parseMoviePreferences,
});

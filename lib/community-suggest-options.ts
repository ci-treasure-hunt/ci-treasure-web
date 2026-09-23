// I-111 Stage 2: option lists shared by the "Suggest an edit" dialog, its server action and the
// admin queue. Kept out of the "use server" file, which may only export async functions.

export const SUGGESTION_TYPES = [
  { value: "broken_link", label: "Broken link" },
  { value: "outdated_info", label: "Outdated info" },
  { value: "duplicate", label: "Duplicate listing" },
  { value: "remove", label: "Should be removed" },
  { value: "other", label: "Other" },
] as const;

export type SuggestionType = (typeof SUGGESTION_TYPES)[number]["value"];

/** Types that ask which fields are affected. */
export const TYPES_WITH_FIELDS: readonly string[] = ["broken_link", "outdated_info"];

export const SUGGESTION_FIELDS = [
  "Name",
  "Type",
  "Location",
  "Activity level",
  "Focus",
  "Languages",
  "Description",
  "Website or social link",
  "Group or chat link",
  "Contact email",
  "Other",
] as const;

export function suggestionTypeLabel(value: string): string {
  return SUGGESTION_TYPES.find((t) => t.value === value)?.label ?? value;
}

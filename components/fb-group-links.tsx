import type { FbGroup } from "@/lib/fb-groups";

// One line of Facebook group links (I-189). No hooks, so both server pages and the client events
// dashboard can render it. Renders nothing for an empty list, so callers can pass the result of
// fbGroupsForEvent() straight in.
export function FbGroupLinks({ lead, groups, className = "" }: { lead: string; groups: FbGroup[]; className?: string }) {
  if (groups.length === 0) return null;
  return (
    <p className={`text-sm leading-6 text-slate-600 ${className}`}>
      {lead}{" "}
      {groups.map((group, i) => (
        <span key={group.url}>
          {i > 0 ? (i === groups.length - 1 ? " and " : ", ") : null}
          <a
            href={group.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-(--color-pine) hover:underline"
          >
            {group.name}
          </a>
        </span>
      ))}
    </p>
  );
}

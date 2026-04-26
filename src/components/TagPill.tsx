import type { TagSummary } from '../types/homebox';

export function TagPill({ tag }: { tag: TagSummary }): JSX.Element {
  const style = tag.color ? { borderColor: tag.color, color: tag.color } : undefined;
  return <span className="tag-pill" style={style}>{tag.name}</span>;
}

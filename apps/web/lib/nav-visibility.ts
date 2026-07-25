// Role-aware navigation (1.4d): hide sidebar items the signed-in user lacks the
// permission for, and drop any group left empty. Pure so it is unit-tested
// without rendering the shell. The server still enforces every request — this
// only avoids showing dead nav items (no fake buttons per the mandate).
export interface NavItemDef {
  href: string;
  label: string;
  icon: string;
  // Permission required to see this item; undefined = always visible.
  permission?: string;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

export const visibleGroups = (
  groups: readonly NavGroupDef[],
  permissions: readonly string[],
): NavGroupDef[] =>
  groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.permission === undefined || permissions.includes(item.permission),
      ),
    }))
    .filter((group) => group.items.length > 0);

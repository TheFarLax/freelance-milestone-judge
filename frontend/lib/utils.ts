export function classNames(
  ...classes: (string | undefined | null | false)[]
): string {
  return classes.filter(Boolean).join(" ");
}

export function formatAddress(
  address: string | null,
  maxLength: number = 12,
): string {
  if (!address) return "";
  if (address.length <= maxLength) return address;

  const prefixLength = Math.floor((maxLength - 3) / 2);
  const suffixLength = Math.ceil((maxLength - 3) / 2);

  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

export function formatDate(isoOrMs: string | number): string {
  const d = new Date(isoOrMs);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

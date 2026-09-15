export function getSameOriginTrpcUrl(locationLike?: Pick<Location, "origin">): string {
  if (locationLike?.origin) return `${locationLike.origin}/api/trpc`;
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}/api/trpc`;
  }
  return "/api/trpc";
}

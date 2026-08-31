// components/brand/BrandedHeader.tsx
//
// 2026-08-30: RE-EXPORT. The component lives in @craudioviz/platform-sdk.
//
// Fifty-nine local copies existed across the org in eleven distinct versions. The
// forks were not merely stale — the plan union was missing 'creator' and
// 'enterprise' while User.subscription_tier carries both, so a PAYING creator or
// enterprise customer was shown 'free' in the header.
//
// The SDK copy also fixes a `@/` path alias that resolves against the CONSUMER's
// tsconfig rather than the package (so from node_modules it resolved to nothing),
// and an exactOptionalPropertyTypes mismatch on User.name.
//
// Re-exported rather than deleted so every existing import keeps working.
export { BrandedHeader } from '@craudioviz/platform-sdk';
export { BrandedHeader as default } from '@craudioviz/platform-sdk';

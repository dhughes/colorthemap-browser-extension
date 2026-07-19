const MAX_COMPONENT = 65535;
const COMPONENT = /^(0|[1-9]\d*)$/;

// Browsers require `manifest.version` to be 1-4 dot-separated integers, each
// 0-65535, with no prerelease/build suffix — Chrome and Edge refuse to load an
// extension whose version is `0.1.0-rc.1` or `0.0.0-dev`. package.json, however,
// is full semver. This derives a manifest-legal version from the package version
// by dropping any prerelease/build metadata down to the numeric core. Same input
// always yields the same output, so builds stay reproducible.
export function toManifestVersion(packageVersion: string): string {
  const withoutBuildMetadata = packageVersion.trim().split("+")[0] ?? "";
  const core = withoutBuildMetadata.split("-")[0] ?? "";
  const components = core.split(".");

  if (components.length < 1 || components.length > 4) {
    throw new Error(
      `Cannot derive a manifest version from "${packageVersion}": expected 1-4 dot-separated numbers, got ${components.length}.`,
    );
  }

  for (const component of components) {
    if (!COMPONENT.test(component)) {
      throw new Error(
        `Cannot derive a manifest version from "${packageVersion}": "${component}" is not a non-negative integer without leading zeros.`,
      );
    }
    if (Number(component) > MAX_COMPONENT) {
      throw new Error(
        `Cannot derive a manifest version from "${packageVersion}": "${component}" exceeds the ${MAX_COMPONENT} maximum for a manifest version component.`,
      );
    }
  }

  return core;
}

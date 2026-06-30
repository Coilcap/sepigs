import { homedir } from "node:os";
import { basename, relative, sep } from "node:path";

const PREFIXES: readonly { readonly path: string; readonly token: string }[] = [
  { path: "/opt/homebrew", token: "${HOMEBREW_PREFIX}" },
  { path: "/usr/local", token: "${LOCAL_PREFIX}" },
  { path: "/usr", token: "${SYSTEM_ROOT}/usr" },
  { path: "/bin", token: "${SYSTEM_ROOT}/bin" },
  { path: "/opt", token: "${LOCAL_OPT}" }
];

export const redactLocalPath = (path: string): string => {
  const home = homedir();
  if (path === home || path.startsWith(`${home}${sep}`)) {
    return joinToken("${HOME}", relative(home, path));
  }
  for (const prefix of PREFIXES) {
    if (path === prefix.path || path.startsWith(`${prefix.path}${sep}`)) {
      return joinToken(prefix.token, relative(prefix.path, path));
    }
  }
  return `<local-only>/${basename(path)}`;
};

const joinToken = (token: string, suffix: string): string =>
  suffix.length === 0 ? token : `${token}/${suffix.split(sep).join("/")}`;

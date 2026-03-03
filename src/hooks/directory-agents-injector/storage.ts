import { AGENTS_INJECTOR_STORAGE } from "./constants";
import { createInjectedPathsStorage } from "@/shared/session/session-injected-paths";

export const {
  loadInjectedPaths,
  saveInjectedPaths,
  clearInjectedPaths,
} = createInjectedPathsStorage(AGENTS_INJECTOR_STORAGE);

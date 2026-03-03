import { README_INJECTOR_STORAGE } from "./constants";
import { createInjectedPathsStorage } from "@/shared/session/session-injected-paths";

export const {
  loadInjectedPaths,
  saveInjectedPaths,
  clearInjectedPaths,
} = createInjectedPathsStorage(README_INJECTOR_STORAGE);

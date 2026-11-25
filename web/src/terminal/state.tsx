// The terminal's shared state. One reducer for the whole shell: the topbar button, the keyboard and
// the pane header all speak to it, and the pane host reads it. Nothing else may open the pane.
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { INITIAL, fitPlacement, reduce, type Origin, type Placement, type TerminalState } from "./machine";

type TerminalCtx = {
  raw: TerminalState;
  state: TerminalState;      // fitted to this screen: a phone never asks for the right side
  phone: boolean;
  show: (from?: Origin) => void;
  hide: (from?: Origin) => void;
  toggle: (from?: Origin) => void;
  place: (placement: Placement, from?: Origin) => void;
  next: (from?: Origin) => void;
};

const Ctx = createContext<TerminalCtx | null>(null);

export const useTerminalPane = (): TerminalCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTerminalPane outside the terminal provider");
  return ctx;
};

const PHONE = "(max-width: 760px)";

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [raw, dispatch] = useReducer(reduce, INITIAL);
  const [phone, setPhone] = useState(() => typeof matchMedia === "function" && matchMedia(PHONE).matches);

  useEffect(() => {
    const mq = matchMedia(PHONE);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = useMemo<TerminalCtx>(() => ({
    raw,
    state: fitPlacement(raw, phone),
    phone,
    show: (from) => dispatch({ type: "show", from }),
    hide: (from) => dispatch({ type: "hide", from }),
    toggle: (from) => dispatch({ type: "toggle", from }),
    place: (placement, from) => dispatch({ type: "place", placement, from }),
    next: (from) => dispatch({ type: "next-placement", from }),
  }), [raw, phone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

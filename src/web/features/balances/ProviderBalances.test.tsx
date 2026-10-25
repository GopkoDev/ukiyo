import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { BALANCE_REFRESH_MS, balanceKey, refreshBalances, useProviderBalance } from "./balances";
import { ProviderBalances } from "./ProviderBalances";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { providers: vi.fn(), providerBalance: vi.fn() },
}));
const m = vi.mocked(api);
const BOTH = {
  providers: [
    { id: "openrouter" as const, name: "OpenRouter", configured: true },
    { id: "vercel" as const, name: "Vercel AI Gateway", configured: true },
  ],
};

function render(extra?: React.ReactNode) {
  return renderWithQuery(
    <TooltipProvider>
      <ProviderBalances />
      {extra}
    </TooltipProvider>,
  );
}
const lines = () => within(screen.getByRole("region", { name: "Provider balances" })).getAllByRole("listitem");
const text = () => lines().map((l) => l.textContent);

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe("navigation bar balances (SCR-04)", () => {
  it("lists each configured provider with two decimals; an unconfigured one is not listed (AC-11)", async () => {
    m.providers.mockResolvedValue({
      providers: [BOTH.providers[0] as never, { id: "vercel", name: "Vercel AI Gateway", configured: false }],
    });
    m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 12.345 });
    render();
    await waitFor(() => expect(text()).toEqual(["OpenRouter$12.35"]));
    expect(m.providerBalance).toHaveBeenCalledTimes(1);
  });

  it("shows «…» first; «—» for an unreadable figure or a failed read, the other provider unaffected (AC-12)", async () => {
    m.providers.mockResolvedValue(BOTH);
    let finish: (v: unknown) => void = () => {};
    m.providerBalance.mockImplementation((id) =>
      id === "openrouter"
        ? new Promise((r) => (finish = r as never))
        : Promise.resolve({ provider: "vercel", remainingUsd: null }),
    );
    render();
    await waitFor(() => expect(text()).toEqual(["OpenRouter…", "Vercel AI Gateway—"]));
    expect(screen.getByLabelText("Vercel AI Gateway: balance unavailable")).toBeVisible();
    await act(async () => finish({ provider: "openrouter", remainingUsd: 3 }));
    await waitFor(() => expect(text()).toEqual(["OpenRouter$3.00", "Vercel AI Gateway—"]));
  });

  it("a failed re-read after a good one shows «—», never the old figure as current", async () => {
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    m.providerBalance
      .mockResolvedValueOnce({ provider: "openrouter", remainingUsd: 5 })
      .mockRejectedValueOnce(new ApiError(500, "HTTP_ERROR", "down"));
    const { client } = render();
    await waitFor(() => expect(text()).toEqual(["OpenRouter$5.00"]));
    await act(async () => refreshBalances(client));
    await waitFor(() => expect(text()).toEqual(["OpenRouter—"]));
  });

  it("is hidden when no provider is configured", async () => {
    m.providers.mockResolvedValue({ providers: [] });
    render();
    await waitFor(() => expect(m.providers).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Provider balances" })).toBeNull();
  });
});

describe("refresh (AC-13, spec §6)", () => {
  function SpeechReader() {
    const q = useProviderBalance("openrouter");
    return <p>speech {q.data?.remainingUsd ?? "none"}</p>;
  }

  it("the Speech page and the bar share one read; a refresh reads once per provider", async () => {
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 7 });
    const { client } = render(<SpeechReader />);
    await screen.findByText("speech 7");
    expect(m.providerBalance).toHaveBeenCalledTimes(1);
    m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 6 });
    await act(async () => refreshBalances(client));
    await screen.findByText("speech 6");
    expect(text()).toEqual(["OpenRouter$6.00"]);
    expect(m.providerBalance).toHaveBeenCalledTimes(2);
  });

  it("triggers during a read merge into exactly one follow-up read", async () => {
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    const pending: ((v: unknown) => void)[] = [];
    m.providerBalance.mockImplementation(() => new Promise((r) => pending.push(r as never)));
    const { client } = render();
    await waitFor(() => expect(pending).toHaveLength(1));
    refreshBalances(client);
    refreshBalances(client);
    expect(m.providerBalance).toHaveBeenCalledTimes(1); // nothing doubled while in flight
    await act(async () => pending[0]?.({ provider: "openrouter", remainingUsd: 9 }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]?.({ provider: "openrouter", remainingUsd: 8 }));
    await waitFor(() => expect(text()).toEqual(["OpenRouter$8.00"]));
    expect(m.providerBalance).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(balanceKey("openrouter"))).toEqual({ provider: "openrouter", remainingUsd: 8 });
  });

  it("re-reads every 5 minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 1 });
    render();
    await waitFor(() => expect(m.providerBalance).toHaveBeenCalledTimes(1));
    await act(async () => vi.advanceTimersByTimeAsync(BALANCE_REFRESH_MS + 100));
    await waitFor(() => expect(m.providerBalance).toHaveBeenCalledTimes(2));
  });

  it("pauses the interval while the tab is hidden and reads once on returning to it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 1 });
    render();
    await waitFor(() => expect(m.providerBalance).toHaveBeenCalledTimes(1));
    try {
      act(() => focusManager.setFocused(false));
      await act(async () => vi.advanceTimersByTimeAsync(BALANCE_REFRESH_MS * 2 + 100));
      expect(m.providerBalance).toHaveBeenCalledTimes(1);
      act(() => focusManager.setFocused(true));
      await waitFor(() => expect(m.providerBalance).toHaveBeenCalledTimes(2));
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it("keeps «—» while re-reading after a first failed read (review R2)", async () => {
    m.providers.mockResolvedValue({ providers: [BOTH.providers[0] as never] });
    let finish: (v: unknown) => void = () => {};
    m.providerBalance
      .mockRejectedValueOnce(new ApiError(500, "HTTP_ERROR", "down"))
      .mockImplementationOnce(() => new Promise((r) => (finish = r as never)));
    const { client } = render();
    await waitFor(() => expect(text()).toEqual(["OpenRouter—"]));
    act(() => refreshBalances(client));
    await waitFor(() => expect(m.providerBalance).toHaveBeenCalledTimes(2));
    expect(text()).toEqual(["OpenRouter—"]);
    await act(async () => finish({ provider: "openrouter", remainingUsd: 4 }));
    await waitFor(() => expect(text()).toEqual(["OpenRouter$4.00"]));
  });
});

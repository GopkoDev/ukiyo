import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import type { Job } from "../../../shared/generations";
import type { ImageModel } from "../../../shared/providers";
import { balanceKey } from "../balances/balances";
import { GeneratePanel } from "./GeneratePanel";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    providers: vi.fn(),
    models: vi.fn(),
    modelPreferences: vi.fn(),
    setModelPreference: vi.fn(),
    currentJob: vi.fn(),
    startGeneration: vi.fn(),
    dismissJob: vi.fn(),
    generation: vi.fn(),
    price: vi.fn(),
    costHistory: vi.fn(),
  },
}));
const m = vi.mocked(api);

const QWEN: ImageModel = {
  id: "qwen/qwen-image",
  name: "Qwen Image",
  params: { aspectRatio: { values: ["1:1", "16:9"] }, n: { max: 4 }, seed: {} },
};
const MUSE: ImageModel = { id: "meta/muse-image", name: "Muse Image", params: {} };
const job = (over: Partial<Job>): Job => ({
  id: "J1",
  status: "running",
  startedAt: new Date().toISOString(),
  ...over,
});

function configured(models: ImageModel[] = [QWEN, MUSE]) {
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.modelPreferences.mockResolvedValue({ preferences: [] });
  m.models.mockResolvedValue({ models, fetchedAt: new Date().toISOString() });
}

async function pickModel(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Model" }));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("GeneratePanel (SCR-01)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.currentJob.mockResolvedValue({ job: null });
  });

  it("explains how to configure a missing key and offers no form", async () => {
    m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: false }] });
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText("OpenRouter is not configured.")).toBeInTheDocument();
    expect(screen.getByText(/OPENROUTER_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Prompt")).not.toBeInTheDocument();
    expect(m.models).not.toHaveBeenCalled();
  });

  it("says when the model list is unavailable and retries", async () => {
    configured();
    m.models.mockRejectedValueOnce(new ApiError(502, "PROVIDER_ERROR", "Could not reach OpenRouter"));
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText("Model list unavailable")).toBeInTheDocument();
    expect(screen.getByText("Could not reach OpenRouter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Model" })).toBeInTheDocument();
  });

  it("offers only the parameters the chosen model supports", async () => {
    configured();
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByRole("combobox", { name: "Aspect ratio" })).toBeInTheDocument(); // first model preselected
    expect(screen.getByLabelText("Seed")).toBeInTheDocument();
    expect(screen.getByLabelText("Images")).toHaveAttribute("max", "4");

    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent(/^Qwen Image$/); // closed picker: name only
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    expect(await screen.findByRole("button", { name: /^Qwen Image/ })).toHaveTextContent("qwen/qwen-image"); // name and id (AC-03)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await pickModel("Muse Image");
    expect(screen.queryByRole("combobox", { name: "Aspect ratio" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Images")).toHaveAttribute("max", "1");
  });

  it("flags invalid fields without sending anything", async () => {
    configured();
    renderWithQuery(<GeneratePanel />);
    await screen.findByRole("button", { name: "Model" });
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Images"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Prompt must not be empty")).toBeInTheDocument();
    expect(screen.getByText("Number of images must be between 1 and 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveAttribute("aria-invalid", "true");
    expect(m.startGeneration).not.toHaveBeenCalled();
  });

  it("starts a generation and locks the form while it runs", async () => {
    configured();
    m.startGeneration.mockResolvedValue({ job: job({}) });
    renderWithQuery(<GeneratePanel />);
    await screen.findByRole("button", { name: "Model" });
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "A red square" } });
    fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "42" } });
    m.currentJob.mockResolvedValue({ job: job({}) });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(m.startGeneration).toHaveBeenCalledWith({
        provider: "openrouter",
        model: "qwen/qwen-image",
        prompt: "A red square",
        params: { n: 1, seed: 42 },
      }),
    );
    const button = await screen.findByRole("button", { name: /Generating/ });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Prompt")).toBeDisabled();
  });

  it("shows a generation already running in another tab, with a ticking elapsed time", async () => {
    configured();
    m.currentJob.mockResolvedValue({ job: job({ startedAt: new Date(Date.now() - 5_000).toISOString() }) });
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByRole("button", { name: /Generating/ })).toBeDisabled();
    expect(screen.getByText("Started 5 s ago")).toBeInTheDocument();
    expect(await screen.findByText("Started 6 s ago", {}, { timeout: 2500 })).toBeInTheDocument();
  });

  it("explains when a notice can't be dismissed", async () => {
    configured();
    m.currentJob.mockResolvedValue({
      job: job({ status: "failed", error: { code: "PROVIDER_ERROR", message: "Nope" } }),
    });
    m.dismissJob.mockImplementation(async () => {
      throw new ApiError(409, "GENERATION_IN_PROGRESS", "A generation is already in progress — wait until it finishes");
    });
    renderWithQuery(<GeneratePanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Couldn't dismiss the notice")).toBeInTheDocument();
    expect(screen.getByText("A generation is already in progress — wait until it finishes")).toBeInTheDocument();

    // once the job changes, the stale dismiss error goes away
    m.currentJob.mockResolvedValue({ job: job({ id: "J2" }) });
    await act(async () => window.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(screen.queryByText("Couldn't dismiss the notice")).not.toBeInTheDocument());
  });

  it("shows the provider's reason, keeps the prompt, and dismisses the notice", async () => {
    configured();
    m.startGeneration.mockResolvedValue({ job: job({}) });
    renderWithQuery(<GeneratePanel />);
    await screen.findByRole("button", { name: "Model" });
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Keep me" } });
    m.currentJob.mockResolvedValue({
      job: job({
        status: "failed",
        error: { code: "PROVIDER_ERROR", message: "Your account has insufficient credits." },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Generation failed", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Your account has insufficient credits.")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveValue("Keep me");

    m.dismissJob.mockResolvedValue(null);
    m.currentJob.mockResolvedValue({ job: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Dismiss" })));
    await waitFor(() => expect(screen.queryByText("Generation failed")).not.toBeInTheDocument());
    expect(m.dismissJob).toHaveBeenCalled();
  });

  it("reads the provider balances again when a generation ends, succeeded or failed (models-page-audio AC-13)", async () => {
    configured();
    m.currentJob.mockResolvedValue({ job: job({ status: "running" }) });
    const fetchBalance = vi.fn(async () => ({ provider: "openrouter" as const, remainingUsd: 1 }));
    const { client } = renderWithQuery(<GeneratePanel />);
    await client.fetchQuery({ queryKey: balanceKey("openrouter"), queryFn: fetchBalance }); // as the navigation bar reads it
    await waitFor(() => expect(m.currentJob).toHaveBeenCalled());
    m.currentJob.mockResolvedValue({ job: job({ status: "failed", error: { code: "PROVIDER_ERROR", message: "x" } }) });
    await waitFor(() => expect(fetchBalance).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it("shows the latest result with a link to it once saved", async () => {
    configured();
    m.currentJob.mockResolvedValue({ job: job({ status: "succeeded", generationId: "01GEN" }) });
    m.generation.mockResolvedValue({
      id: "01GEN",
      provider: "openrouter",
      model: "qwen/qwen-image",
      prompt: "A red square",
      requestedParams: { n: 1 },
      acceptedParams: null,
      imagesRequested: 1,
      inputs: [],
      images: [
        {
          position: 1,
          url: "/api/files/generations/01GEN/output-1.png",
          mediaType: "image/png",
          width: 4,
          height: 3,
          byteSize: 9,
        },
      ],
      costMicros: 40000,
      costStatus: "known",
      createdAt: new Date().toISOString(),
      durationMs: 900,
      rawRequest: {},
      rawResponse: {},
      tags: [],
      comment: null,
      source: null,
      derived: { items: [], total: 0 },
    });
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText("Saved to gallery")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Open/ })).toHaveAttribute("href", "/generations/01GEN");
  });

  it("stops showing the latest result once its generation was deleted", async () => {
    configured();
    m.currentJob.mockResolvedValue({ job: job({ status: "succeeded", generationId: "01GONE" }) });
    m.generation.mockImplementation(async () => {
      throw new ApiError(404, "NOT_FOUND", "Generation not found");
    });
    renderWithQuery(<GeneratePanel />);
    await screen.findByRole("button", { name: "Model" });
    await waitFor(() => expect(m.generation).toHaveBeenCalledWith("01GONE"));
    await waitFor(() => expect(screen.queryByText("Saved to gallery")).not.toBeInTheDocument());
  });

  it("shows the selected model's price and an estimate that follows the number of images (step 7)", async () => {
    configured();
    m.price.mockResolvedValue({
      price: { kind: "per-image", output: { minUsd: 0.0184, maxUsd: 0.0184 }, input: null },
      fetchedAt: new Date().toISOString(),
    });
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText("$0.0184 / image")).toBeInTheDocument();
    expect(screen.getByText("Estimate ≈ $0.02 for 1 image")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Images"), { target: { value: "3" } });
    expect(await screen.findByText("Estimate ≈ $0.06 for 3 images")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();

    // the estimate never leaves the browser (AC-08): the request carries exactly the form's fields
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "A red square" } });
    m.startGeneration.mockResolvedValue({ job: job({}) });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(m.startGeneration).toHaveBeenCalled());
    const [sent] = m.startGeneration.mock.calls[0] ?? [];
    expect(JSON.stringify(sent)).not.toMatch(/estimate|price|cost/i);
  });

  it("refreshes the per-token estimate once a generation finishes", async () => {
    configured();
    m.price.mockResolvedValue({ price: { kind: "per-token" }, fetchedAt: new Date().toISOString() });
    m.costHistory.mockResolvedValue({ count: 0, perImageMicros: null });
    m.currentJob.mockResolvedValue({ job: job({}) }); // running
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText(/No estimate before generating/)).toBeInTheDocument();
    m.costHistory.mockResolvedValue({ count: 1, perImageMicros: 60_000 });
    m.currentJob.mockResolvedValue({ job: job({ status: "succeeded", generationId: "01DONE" }) });
    expect(await screen.findByText(/Estimate ≈ \$0\.06/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("says «Price unknown» for a model the provider doesn't offer", async () => {
    configured();
    m.price.mockImplementation(async () => {
      throw new ApiError(404, "NOT_FOUND", "This model is not offered by the provider");
    });
    renderWithQuery(<GeneratePanel />);
    expect(await screen.findByText("Price unknown")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).not.toBeInTheDocument();
  });
});

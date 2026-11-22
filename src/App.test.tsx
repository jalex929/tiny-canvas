import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { Drawing, DrawingStore } from "./storage/drawing";

function fakeStore(saved: Drawing | null): DrawingStore & { gets: number } {
  return {
    label: "test",
    gets: 0,
    async list() {
      return [];
    },
    async get() {
      this.gets++;
      return saved;
    },
    async save() {},
    async remove() {},
  };
}

const savedDrawing: Drawing = {
  id: "d-saved",
  title: "Saved one",
  createdAt: 1,
  updatedAt: 2,
  thumbnail: null,
  width: 1400,
  height: 1400,
  actions: [{ type: "background", color: "#000052" }],
};

describe("App", () => {
  beforeEach(() => localStorage.setItem("tiny-canvas:last-open", "d-saved"));
  afterEach(() => localStorage.clear());

  it("reopens the last drawing once, not on every render", async () => {
    const store = fakeStore(savedDrawing);
    render(<App store={store} />);
    const title = await screen.findByDisplayValue("Saved one");
    await userEvent.type(title, " again");
    act(() => title.blur());
    await userEvent.keyboard("3"); // re-render via a brush shortcut
    expect(store.gets).toBe(1);
    expect(title).toHaveValue("Saved one again");
  });

  it("says when saving is unavailable instead of failing silently", async () => {
    render(<App store={null} />);
    expect(screen.getByText(/Saving is off in this browser/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "My drawings" })).toBeDisabled();
    await act(async () => {});
  });

  it("switches brushes from the keyboard", async () => {
    render(<App store={null} />);
    await userEvent.keyboard("5");
    expect(screen.getByRole("radio", { name: "Spray" })).toBeChecked();
    await userEvent.keyboard("0");
    expect(screen.getByRole("radio", { name: "Pattern" })).toBeChecked();
    await userEvent.keyboard("e");
    expect(screen.getByRole("radio", { name: "Eraser" })).toBeChecked();
    await userEvent.keyboard("e");
    expect(screen.getByRole("radio", { name: "Pen" })).toBeChecked();
  });
});

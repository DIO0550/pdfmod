import type { Meta, StoryObj } from "@storybook/react";
import { PdfViewer } from "../src/index.js";

const meta: Meta<typeof PdfViewer> = {
  title: "Components/PdfViewer",
  component: PdfViewer,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof PdfViewer>;

export const Empty: Story = {
  args: {
    source: null,
  },
};

export const WithDocument: Story = {
  args: {
    source: new TextEncoder().encode("%PDF-1.7 stub"),
  },
};

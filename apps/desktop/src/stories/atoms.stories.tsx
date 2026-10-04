import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@movie-explorer/ui/components/button";

const meta = {
  title: "Atoms/Button",
  component: Button,
  args: {
    children: "Search",
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Cancel",
  },
};

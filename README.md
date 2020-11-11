#  Handy Dandy Notebook - VS Code

Execute cells in bash, JavaScript, TypeScript, Ruby, or Python.

Provides the command: `New Handy Dandy Notebook` to open a new untitled notebook. Also opens `.hdnb` files by default, and opens `.md` files via the `View: Reopen Editor With...` option.

![Example of each supportted language printing hello world](./example.gif)

## How It Works

Unlike some notebook implementations, the Handy Dandy Notebook does not share any state across cells. This means each time you execute a cell, it runs in a brand new context, totally isolated from the rest of the cells.
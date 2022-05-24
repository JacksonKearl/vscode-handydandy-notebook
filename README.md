#  Handy Dandy Notebook - VS Code

Execute cells in bash, JavaScript, TypeScript, Ruby, or Python.

Provides the command: `New Handy Dandy Notebook` to open a new untitled notebook. Also opens `.hdnb` files by default, and opens `.md` files via the `View: Reopen Editor With...` option.

![Example of each supportted language printing hello world](./example.gif)

## How It Works

Unlike some notebook implementations, the Handy Dandy Notebook does not share any state across cells. This means each time you execute a cell, it runs in a brand new context, totally isolated from the rest of the cells.

Cells support a `{{auth:github}}` token which will be replaced with a github token with repo scope at time of execution.

## Config

### handydandy-notebook.dispatch

Used to configure how to execute cells. Array where the first element is the program to launch and second argument is array of arguments to pass. The string `${code}` in a an argument will be substituted for the cell contents.

Default:
```json
{
"python": [ "python", [ "-c", "${code}" ] ],
"typescript": [ "ts-node", [ "-T", "--skip-project", "-e", "${code}" ] ],
"javascript": [ "node", [ "-e", "(async () => { ${code} } )()" ] ],
"ruby": [ "ruby", [ "-e", "${code}" ] ],
"shellscript": [ "bash", [ "-c", "${code}" ] ],
"bash": [ "bash", [ "-c", "${code}" ] ]
}
```

## Changelog

### 0.1.2

Added `{{auth:github}}` as a token that expands to contain a github access token

### 0.1.3

Added `{{cell:TITLE}}` as a token that expands to reference an existing cell by header name.

This token will be substituted with the combined contents of all code cells immediately following all markdown cells containing `# TITLE`.

Added support for passing an object to be used as the execution environment via the dispatch config.
# Scoped execution in v3

The hook checks declared command inputs before the host executes them. It does not sandbox a process, inspect arbitrary program source, monitor network packets, resolve DNS rebinding, or constrain redirects and subprocesses created internally by a tool. Unknown executable names are not inferred to be attack tools. These limits also apply to user-controlled executables and configuration files. Use an isolated execution environment when network-level confinement is required.

Command inspection joins quoted word fragments before checking executable names and URLs. It recognizes command separators, substitutions, assignments, documented wrappers, and plain shell command payloads. Dynamic executable names, brace/glob expansions in executable position, encoded/file interpreter modes, stdin-driven `xargs`, `env --split-string`, and recognized indirect execution forms are refused. No raw-text fallback grants permission after a parse error. An armed scope also refuses dynamic argument values.

The attack tool set is `nuclei`, `semgrep`, `sqlmap`, `nmap`, `ffuf`, `nikto`, `naabu`, `subfinder`, `katana`, `hydra`, `zap-baseline`, and `zap.sh`. Every invocation of these names needs a live current scope. In addition, the following explicit target grammar is required:

| Tool | Accepted target form |
| --- | --- |
| nuclei | `-u URL` or `-target URL` |
| sqlmap | `-u URL` or `--url URL` |
| ffuf | `-u URL` |
| nikto | `-h URL` or `-host URL` |
| katana | `-u URL` |
| zap-baseline | `-t URL` |
| zap.sh | `-quickurl URL` |
| naabu | `-host HOST` |
| subfinder | `-d HOST` or `-domain HOST` |
| nmap | One or more positional hostname/IP literals |

`URL` means a complete HTTP(S) URL permitted by the scope. `HOST` means one unambiguous hostname or IP literal and requires a matching scope target without a port restriction. CIDR, ranges, target files, implicit stdin targets, missing targets, and unsupported options are refused. Host options such as `nmap -p` are not part of this grammar. `semgrep` and `hydra` have no accepted target form under this contract and are refused by the scope hook.

Accepted extra switches are limited to these non-target controls: `-silent`, `-json`, `-jsonl`, `-nc`, and `-no-color` for the ProjectDiscovery tools above; `--batch` for sqlmap; `-s`, `-json`, and `-noninteractive` for ffuf; and `-I`/`-i` for zap-baseline. Nmap additionally accepts `-sV`, `-sT`, `-sS`, `-sn`, `-Pn`, and `-n`. Every other option is rejected rather than guessed. An attack command must resolve to one invocation without pipes, redirections, or substitutions supplying additional execution inputs.

While a scope is armed, literal HTTP(S) URLs in every decoded command argument must be permitted, including ordinary `curl` calls. An out-of-scope target blocks the whole command. The hook never rewrites arguments or reconstructs a shell command.

A tagged `[ohmy-redteam ...]` dispatch must include at least one explicit permitted HTTP(S) URL. Additional bare hostname/IP-like text is rejected as an ambiguous target declaration. Ordinary untagged dispatches remain outside this gate. The tag and URL check constrain declared dispatch inputs; hooks do not observe commands executed inside subagents.

# Citation identity

A retrieved source is identified by the parsed URL. URL-standard scheme/host canonicalization and removal of the document fragment are applied. Scheme, hostname including `www`, path case, trailing path slash, query case and values, and document version remain significant. A PDF, an abstract page, HTTP and HTTPS endpoints, and different arXiv versions require their own retrievals. Fetched URL data is not stripped of punctuation. Use explicit Markdown links when a sentence ends immediately after a URL so its exact boundary is clear.

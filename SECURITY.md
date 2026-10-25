# Security

This is a read-only local development tool, not a hardened multi-tenant file server.
Choose a workspace containing only files that every authorized viewer may read.
The application has no user accounts or per-file permissions. Keep it on loopback
or behind an authenticated, access-controlled private proxy.

Markdown raw HTML is disabled, HTML source is previewed as text, and external
images are not fetched. Hidden files, common credential names and external
symlinks are filtered, but these filters cannot recognize every sensitive file.
Concurrent filesystem changes and untrusted local writers are outside the
security boundary; do not use this tool as an OS sandbox.

Report vulnerabilities privately through the repository owner's contact channel;
do not attach real workspace files or credentials to public issues.

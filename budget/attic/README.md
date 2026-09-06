Dead files carried over from the original Budget_Management repo.

App.clean.tsx and App.new.tsx are unreferenced (src/main.tsx imports ./App.tsx)
and both have unclosed JSX, so they broke `tsc -b`. Moved here, outside the
tsconfig include path, so the build passes. Nothing imports them. Delete when
you're sure you don't want them.

# Axio Control

> **Axiovel status:** this fork is the current production Control GUI App for
> Axiovel indoor drone-light-show operations. It loads and assigns `.skyc`
> shows and sends per-UAV `__show_upload` commands to the production Axio
> Server. AV-Desktop is maintained separately as an experimental successor
> candidate.

Axio Control is Axiovel's production ground control station for drone light
shows — the desktop and web frontend for the Axio Server.

Repository: <https://github.com/Axiovel-tech/control>

## About this fork

Axio Control is a GPL-3.0 fork of [Skybrush Live](https://skybrush.io) by
CollMot Robotics. Protocol identifiers, file formats and the `@skybrush`
library packages are intentionally kept compatible with upstream.

## Steps to install

1. Install Node.js and `npm` (the Node.js Package Manager). Note that Ubuntu
   Linux may contain an old version of Node.js at the time of writing and we
   need a recent one, so you need to run the following from the command line:

   ```sh
   curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

   If you are running Windows, you should probably download an installer from
   [here](https://nodejs.org/en/download/) that contains both.

2. Install all the dependencies by running `npm install` from a fresh checkout
   of the repository.
   _(Note for Windows: For some reason the `PATH` environment variable of
   `cmd` is not always the same as the one in `PowerShell`, so you may have
   to use the latter one or alternatively `git-shell` for the command above
   to run properly.)_

3. Copy `.env.example` to `.env` and include your Bing Maps / Mapbox / Mapzen
   API key in it if you want to support these map providers. (None of them
   are required).

4. Start a development web server with `npm start` inside the checkout, and
   navigate to http://localhost:8080 from your browser. Alternatively, run
   `npm run start:electron` to run Axio Control within its own desktop app
   window.

## Support

Please open an issue at
<https://github.com/Axiovel-tech/control/issues>.

## License

Copyright 2018-2025 CollMot Robotics Ltd.
Copyright 2025-2026 Axiovel

Axio Control is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

Axio Control is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.

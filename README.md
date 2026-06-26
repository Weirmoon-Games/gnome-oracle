# gnome-oracle
The Oracle of Truth

## Linux deployment

On Debian/Ubuntu servers, run:

```bash
sudo SERVER_NAME=your.domain.com bash deploy/install-linux.sh
```

The script will:

- install OS packages for Node.js, nginx, and native module builds
- install a recent Node.js runtime if the server does not already have one
- build the app in standalone mode
- install and start a systemd service
- configure nginx to proxy `http://your.domain.com` to the app
- install and start Ollama if it is missing, then pull the default model

If you want the app on a non-default port or with a different model, set `PORT`,
`OLLAMA_MODEL`, or `OLLAMA_URL` before running the script.

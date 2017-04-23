# X-Preview

X-Preview previews thumbnail images on e-hentai.org and exhentai.org.


## Installing

#### For full instructions and information, go to the [proper homepage](https://dnsev-h.github.io/x-preview/).

To quickly install, here are the links to the different userscript versions:

* <b>[x-preview.user.js](https://raw.githubusercontent.com/dnsev-h/x-preview/stable/builds/x-preview.user.js)</b> - the standard version of the userscript<br />
  You probably want this version
* <b>[x-preview.debug.user.js](https://raw.githubusercontent.com/dnsev-h/x-preview/stable/builds/x-preview.debug.user.js)</b> - the debugging version of the userscript<br />
  If you install this version, keep in mind:
  * <i>It will be somewhat slower than the standard version</i>
  * <i>It <b>will not</b> overwrite the standard version</i>
  * <i>It <b>will not</b> automatically update (probably)</i>


## Developing

* Install [Node.js](https://nodejs.org/)
* Clone the repository
* Run `npm install` in the repository directory to install the required modules

#### build.js usage

```batch
node x-build [options] <meta files...>

Available options:
  --dev   Enable continous builds when relevant script files are updated
  --full  Build with full debugging information

If no meta files are specified, "./src/main.json" is used.
Otherwise, <meta files> is a list of .json files that act as build descriptors.
```

#### Post-build

You can also add a custom `post_build.bat` or `post_build.sh` file which is executed after a build is complete.

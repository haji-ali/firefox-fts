To build, install `web-ext` and run

``` sh
web-ext build

export FIREFOX_SECRETS=`pass firefox.com | tail -n +2`

export AMO_JWT_ISSUER=$(echo "$FIREFOX_SECRETS" | awk -F': ' '/JWT_ISSUER/{print $2}')
export AMO_JWT_SECRET=$(echo "$FIREFOX_SECRETS" | awk -F': ' '/JWT_SECRET/{print $2}')

web-ext sign --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

where the issuer and key are from `https://addons.mozilla.org/en-GB/developers/addon/api/key/`

You can install the addon from a folder from about:debugging

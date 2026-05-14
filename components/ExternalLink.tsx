import { Link, type ExternalPathString } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Platform } from 'react-native';

type ExternalLinkProps = Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: ExternalPathString;
};

export function ExternalLink(
  props: ExternalLinkProps
) {
  const url = props.href;

  return (
    <Link
      target="_blank"
      {...props}
      href={url}
      onPress={(e) => {
        e.preventDefault();
        if (Platform.OS !== 'web') {
          WebBrowser.openBrowserAsync(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }}
    />
  );
}

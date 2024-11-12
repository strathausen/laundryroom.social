import { useState } from "react";
import { Share1Icon } from "@radix-ui/react-icons";
import {
  FacebookIcon,
  FacebookShareButton,
  TwitterIcon,
  TwitterShareButton,
  WhatsappIcon,
  WhatsappShareButton,
} from "react-share";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface ShareMenuProps {
  title: string;
  url: string;
}
export function ShareMenu(props: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen(!isOpen);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button onClick={toggle} className="flex items-center" variant="ghost">
          <Share1Icon className="mr-2 h-4 w-4" />
          share
        </Button>
      </PopoverTrigger>
      <PopoverContent sideOffset={4} className="flex w-auto gap-2 p-2">
        <TwitterShareButton url={props.url} title={props.title}>
          <TwitterIcon className="h-8 w-8" />
        </TwitterShareButton>
        <FacebookShareButton url={props.url} title={props.title}>
          <FacebookIcon className="h-8 w-8" />
        </FacebookShareButton>
        <WhatsappShareButton url={props.url} title={props.title}>
          <WhatsappIcon className="h-8 w-8" />
        </WhatsappShareButton>
      </PopoverContent>
    </Popover>
  );
}

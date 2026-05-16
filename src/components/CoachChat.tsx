import { useState, useEffect } from "react";
import { Bot, X } from "lucide-react";
import aiBotIcon from "@/assets/ai-bot-icon.jpg";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

export const CoachChat = ({ currentSection = "Concept", progress = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("coach-tooltip-seen");
    if (!seen) {
      setShowTooltip(true);
      setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem("coach-tooltip-seen", "true");
      }, 8000);
    }
  }, []);

  const floatingRingCircumference = 2 * Math.PI * 16;
  const floatingRingOffset = floatingRingCircumference - (progress / 100) * floatingRingCircumference;

  return (
    <>
      {/* Floating Orb */}
      <TooltipProvider>
        <div
          className="fixed bottom-6 right-6 z-50"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <Tooltip open={showTooltip || isHovering}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsOpen(true)}
                className="relative group"
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                }}
              >
                {/* Orb Glow */}
                <div
                  className="absolute inset-0 rounded-full flex items-center justify-center transition-all duration-500 group-hover:scale-110"
                  style={{
                    background:
                      "radial-gradient(circle, hsl(43,75%,75%) 0%, hsl(43,65%,58%) 50%, hsl(43,55%,48%) 100%)",
                    boxShadow:
                      "0 0 35px hsl(43,70%,60%/0.7), 0 0 45px hsl(43,70%,60%/0.4), 0 4px 16px hsl(43,52%,50%/0.5)",
                    animation: "ai-orb-rotate 20s linear infinite, ai-glow-vibrant 2s ease-in-out infinite",
                  }}
                >
                  <img
                    src={aiBotIcon}
                    alt="AI Coach"
                    className="w-full h-full rounded-full object-cover"
                    style={{
                      filter: "drop-shadow(0 2px 4px hsl(43,52%,20%/0.4))",
                    }}
                  />
                </div>

                {/* Progress Ring */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <svg className="w-7 h-7 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" stroke="hsl(43,52%,50%/0.15)" strokeWidth="2" fill="none" />
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      stroke="hsl(43,70%,60%)"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray={floatingRingCircumference}
                      strokeDashoffset={floatingRingOffset}
                      strokeLinecap="round"
                      style={{
                        filter: "drop-shadow(0 0 4px hsl(43,70%,60%/0.6))",
                        transition: "stroke-dashoffset 0.5s ease-out",
                      }}
                    />
                  </svg>
                  <div
                    className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
                    style={{ color: "hsl(43,52%,35%)" }}
                  >
                    {Math.round(progress)}%
                  </div>
                </div>
              </button>
            </TooltipTrigger>

            <TooltipContent
              side="left"
              className="max-w-sm p-4 border"
              style={{
                background: "linear-gradient(135deg,hsl(25,35%,12%)0%,hsl(25,30%,15%)100%)",
                borderColor: "hsl(43,52%,50%/0.4)",
                color: "hsl(40,50%,98%)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-5 h-5" style={{ color: "hsl(43,70%,60%)" }} />
                <p className="text-sm font-semibold">Manufacturing Coach AI</p>
              </div>
              <p className="text-xs opacity-90">Hi! I’m here to help you with {currentSection}.</p>
              <p className="text-[10px] opacity-60 mt-1">Click to open assistant panel</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Drawer Panel */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-[480px] p-0 border-l-2"
          style={{
            background: "linear-gradient(135deg,hsl(40,50%,98%/0.98)0%,hsl(40,50%,99%/0.98)100%)",
            borderColor: "hsl(43,52%,50%/0.3)",
            boxShadow: "-12px 0 48px hsl(43,52%,30%/0.15),inset 1px 0 0 hsl(0,0%,100%/0.4)",
          }}
        >
          <SheetHeader
            className="p-5 border-b flex justify-between items-center"
            style={{
              background: "linear-gradient(90deg,hsl(43,70%,65%/0.9)0%,hsl(43,60%,55%/0.9)100%)",
              color: "#fff",
              borderColor: "transparent",
              boxShadow: "0 2px 6px hsl(43,52%,40%/0.3)",
            }}
          >
            <SheetTitle className="text-base font-semibold">Manufacturing Coach</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" color="#fff" />
            </Button>
          </SheetHeader>

          <ScrollArea className="flex-1 p-5 space-y-4">
            <div
              className="rounded-lg p-4 shadow-sm border"
              style={{
                background: "hsl(0,0%,100%/0.7)",
                borderColor: "hsl(43,52%,50%/0.15)",
              }}
            >
              <p className="text-sm text-gray-800 leading-relaxed">
                👋 Hi there! I’m your AI Manufacturing Coach.
                <br />
                <br />I can help you document ingredients, plan shelf-life testing, or refine your cost model — all
                inside this workspace.
              </p>
            </div>

            <div
              className="rounded-lg p-4 shadow-sm border"
              style={{
                background: "linear-gradient(135deg,hsl(43,70%,97%)0%,hsl(40,60%,99%)100%)",
                borderColor: "hsl(43,52%,50%/0.2)",
              }}
            >
              <p className="text-sm font-medium text-gray-900 mb-1">Next step suggestion:</p>
              <p className="text-sm text-gray-700">
                Open your <strong>{currentSection}</strong> section and make sure all required fields are filled in
                before moving on.
              </p>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};

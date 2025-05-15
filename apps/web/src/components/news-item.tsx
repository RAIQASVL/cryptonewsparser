"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, Edit, ExternalLink } from "lucide-react"
import { NewsItem as SharedNewsItem } from "@cryptonewsparser/shared"

interface NewsItemProps {
  news: SharedNewsItem
  onEdit: () => void
}

export function NewsItemCard({ news, onEdit }: NewsItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const formatDate = (dateInput: Date | string | null | undefined): string => {
    if (!dateInput) return "Date unavailable";
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch (e) {
      console.error("Error formatting date:", dateInput, e);
      return "Date format error";
    }
  }

  const createMarkup = (htmlContent: string | null | undefined) => {
    const sanitizedHtml = htmlContent?.replace(/<script.*?>.*?<\/script>/gi, '') || '';
    return { __html: sanitizedHtml };
  };

  const displayContent = news.edited_content || news.full_content || news.preview_content || news.description || "No content available.";
  const hasEditedContent = !!news.edited_content;

  return (
    <Card className="w-full overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <a
              href={news.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
              title={`Open article: ${news.title}`}
            >
              <CardTitle className="text-lg font-semibold leading-snug mb-1 inline-block">
                {news.title || "Untitled"}
              </CardTitle>
            </a>
            <CardDescription className="text-xs text-muted-foreground">
              Source: {news.source} | Published: {formatDate(news.published_at)}
              {news.author && ` | By: ${news.author}`}
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7" title="Edit Content">
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 text-sm">
        {!isExpanded && news.description && (
          <p className="text-muted-foreground mb-3 line-clamp-3">
            {news.description}
          </p>
        )}
        {news.category && (
          <Badge variant="outline" className="text-xs mr-1 mb-1">
            {news.category}
          </Badge>
        )}
        {news.content_type && (
          <Badge variant="secondary" className="text-xs mr-1 mb-1">
            {news.content_type}
          </Badge>
        )}

        <motion.div
          initial={false}
          animate={{
            height: isExpanded ? "auto" : 0,
            opacity: isExpanded ? 1 : 0,
            marginTop: isExpanded ? '1rem' : 0,
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            className="prose prose-sm dark:prose-invert max-w-none border-t pt-4 mt-2"
            dangerouslySetInnerHTML={createMarkup(displayContent)}
          />
          {hasEditedContent && (
            <div className="mt-3 pt-3 border-t border-dashed border-yellow-500/50">
              <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400 border-yellow-500/50 mb-2">Original Content</Badge>
              <div
                className="prose prose-sm dark:prose-invert max-w-none opacity-70"
                dangerouslySetInnerHTML={createMarkup(news.full_content || news.description)}
              />
            </div>
          )}
        </motion.div>
      </CardContent>
      <CardFooter className="pt-0 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs flex items-center text-muted-foreground hover:text-foreground"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" /> Hide Full Content
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" /> Show Full Content
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}


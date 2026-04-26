#include "EventLog.hpp"

#include <stdexcept>

namespace pac {

EventLog::EventLog(const std::string& path) {
    if (path.empty()) {
        return;
    }
    out_.open(path, std::ios::binary | std::ios::trunc);
    if (!out_) {
        throw std::runtime_error("EventLog: failed to open " + path);
    }
}

void EventLog::write(const std::string& line) {
    if (!out_.is_open()) {
        return;
    }
    out_.write(line.data(), static_cast<std::streamsize>(line.size()));
    out_.put('\n');
    // Flush so a crash mid-run still produces a useful tail. The cost is
    // negligible at engine tick rates.
    out_.flush();
}

} // namespace pac

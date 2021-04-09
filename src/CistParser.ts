import {By, WebDriver, WebElement} from "selenium-webdriver";
import {TimeTableType} from "./types/TimeTableType";
import {ExtraInfoType} from "./types/ExtraInfoType";
import {GroupDataType} from "./types/GroupDataType";


export class CistParser {
  private driver: WebDriver;
  private readonly url: string;

  private result: TimeTableType[] = [];
  private curDate: string = "01.02.2021";
  private curTime: string = "07:45 - 09:20";

  private extraInfo: ExtraInfoType[];
  private allRows: WebElement[];

  private chosenGroupID: string[];
  private session: string;
  private rawGroupsData: WebElement[];
  private clearGroupsData: GroupDataType[]

  constructor(driver: WebDriver, url: string) {
    this.driver = driver;
    this.url = url;
  }

  async parseGroups() {
    await this.driver.get("https://cist.nure.ua/");
    await this.driver.executeScript("doSubmit('T_TIME_TABLE')");

    this.session = (await this.driver.getCurrentUrl()).match(/[0-9]{16}/g)?.[0];
    this.rawGroupsData = await this.driver.findElements(By.css("div#GROUPS_AJAX table.t13FormRegion"));

    for (let item of this.rawGroupsData) {
      const curCourse = await item.findElement(By.css("thead th.t13RegionTitle")).getText();
      this.clearGroupsData.push(
        {
          course: curCourse,
          groups: []
        }
      );

      const curGroups = await item.findElements(By.css("tbody td.t13RegionBody a"));

      for (let group of curGroups) {
        const rawGroup: string = await group.getAttribute("onclick");
        const dataGroup: string[] = rawGroup.match(/('[А-Яа-яёЁЇїІіЄєҐґ]+-[0-9]+-[0-9]+',[0-9]+)/gm)![0].split(",");
        this.clearGroupsData.slice(-1)[0].groups.push(
          {
            id: dataGroup[1],
            name: dataGroup[0].match(/[А-Яа-яёЁЇїІіЄєҐґ]+-[0-9]+-[0-9]+/gm)![0]
          }
        );
      }
    }
  }

  /**
   * Take a name of group and return full link to time table
   * @return full link to time table
   * @param name group in time table
   */
  choseGroup(name: string) : string {
    if (this.clearGroupsData.length > 0) {
      let chosenGroup = [];
      for (const item of this.clearGroupsData) {
        const group = item.groups.filter(i => i.name === name);
        if (group.length > 0)
          chosenGroup.push(group[0]);
      }
      if (chosenGroup.length > 0) {
        this.chosenGroupID[0] = chosenGroup[0].id;
        this.chosenGroupID[1] = chosenGroup[1].name;

        return `https://cist.nure.ua/ias/app/tt/f?p=778:201:${this.session}:::201:P201_FIRST_DATE,P201_LAST_DATE,P201_GROUP,P201_POTOK:${CistParser.getDates()[0]},${CistParser.getDates()[1]},${this.chosenGroupID[0]},0:`;
      } else {
        throw "Group not found !";
      }
    } else {
      throw "Data of group is empty";
    }
  }

  async parse() : Promise<TimeTableType[]> {
    await this.driver.get(this.url);

    this.allRows = (await this.driver.findElements(By.css("table.MainTT tr"))).slice(1);

    this.result = await this.getPairs();
    await this.analyzeTypeLesson();

    return this.result;
  }

  private async analyzeTypeLesson() {
    this.extraInfo = await this.getMappedExtras(await this.driver.findElements(By.css("table.footer tr")));

    for (let i = 0; i < this.result.length; i++) {
      const item = this.result[i];
      if (item.name.length > 0) {
        const curExtra = this.extraInfo.filter(i => i.shortName === item.name)[0];
        if (item.name === curExtra.shortName) {
          item.extraInfo = curExtra;
        }
      }
    }
  }

  private async getPairs() : Promise<TimeTableType[]> {
    const result: TimeTableType[] = [];

    for (const row of this.allRows) {
      for (const i of (await row.findElements(By.css("td"))).slice(1)) {
        const regex = /[0-9]{2}\.[0-9]{2}\.[0-9]{2}|[0-9]{2}:[0-9]{2}/g;
        if ((await i.getText()).match(regex) !== null) {
          const timeOrDate = (await i.getText());

          if (timeOrDate.match(/[0-9]{2}\.[0-9]{2}\.[0-9]{2}/g) !== null) {
            this.curDate = timeOrDate.match(/[0-9]{2}\.[0-9]{2}\.[0-9]{2}/g)[0];
          }
          if (timeOrDate.match(/[0-9]{2}:[0-9]{2}/g) !== null) {
            this.curTime = timeOrDate.match(/[0-9]{2}:[0-9]{2}/g).join(" - ");
          }
        }
        else {
          if ((await i.getText()) !== " ") {
            const [title, type, cabinet, numCabinet] = (await i.getText()).split(" ");
            result.push(
              {
                name: title,
                time: this.curTime,
                date: this.curDate,
                type: type,
                cabinet: cabinet + " " + numCabinet
              }
            )
          } else {
            result.push(
              {
                name: "",
                time: this.curTime,
                date: this.curDate,
                type: "",
                cabinet: ""
              }
            )
          }
        }
      }
    }
    return result;
  }

  private async getMappedExtras(info: WebElement[]) : Promise<ExtraInfoType[]> {
    const res: ExtraInfoType[] = [];

    for (const item of info) {
      const curTitle = await item.findElement(By.className("name")).getText();
      const curInfo = await (await item.findElements(By.css("td")))[1].getText();
      const [fullTitle, ...counts] = curInfo.split(":");

      res.push({
        shortName: curTitle,
        fullName: fullTitle,
        countsLessons: {
          lecture: {
            info: counts.filter(i => i.match(/ Лк /g))[0]?.split(" - ")[1],
            counts: parseInt(counts.filter(i => i.match(/ Лк /g))[0]?.match(/[0-9]+/g)[0])
          },
          laba: {
            info: counts.filter(i => i.match(/ Лб /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Лб ")
          },
          practice: {
            info: counts.filter(i => i.match(/ Пз /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Пз ")
          },
          consult: {
            info: counts.filter(i => i.match(/ Конс /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Конс ")
          },
          exam: {
            info: counts.filter(i => i.match(/ ІспКомб /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," ІспКомб ")
          },
          pass: {
            info: counts.filter(i => i.match(/ Зал /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Зал ")
          }
        }
      });
    }
    return res;
  }

  private getCountTypesLearn(arr: string[], type: string) {
    return parseInt(arr.filter(i => new RegExp(type, "g").exec(i))[0]?.match(/[0-9]+/g)[0]);
  }

  private static getDates(): string[] {
    const [day, month, year] = new Date(Date.now()).toLocaleString().split(",")[0].split(".");
    let startDate = "";
    let endDate = "";
    if (month > "01") {
      startDate = `01.02.${parseInt(year)}`
      endDate = `30.07.${parseInt(year)}`
    } else if (month <= "01") {
      startDate = `01.09.${parseInt(year)}`
      endDate = `30.01.${parseInt(year)+1}`
    }

    return [startDate, endDate];
  }
}
